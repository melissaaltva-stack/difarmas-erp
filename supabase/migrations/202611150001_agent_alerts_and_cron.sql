-- FARMI: persistent operational alerts and autonomous database schedule.
-- Read-only against erp_state; only writes derived alert records.
create extension if not exists pg_cron with schema pg_catalog;

grant usage on schema cron to postgres;
grant all privileges on all tables in schema cron to postgres;

create schema if not exists private authorization postgres;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to postgres;

create table if not exists public.agent_alerts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  alert_key text not null,
  title text not null,
  detail text not null,
  category text not null check (category in ('Inventario','Vencimientos','Cuentas por cobrar','Cuentas por pagar','Finanzas')),
  severity text not null check (severity in ('critical','warning','info')),
  status text not null default 'pending' check (status in ('pending','attended')),
  is_active boolean not null default true,
  detected_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  attended_at timestamptz,
  resolved_at timestamptz,
  constraint agent_alerts_user_key_unique unique (user_id, alert_key),
  constraint agent_alerts_attended_at_consistency check (
    (status = 'pending' and attended_at is null) or
    (status = 'attended' and attended_at is not null)
  )
);

create index if not exists agent_alerts_user_active_idx
  on public.agent_alerts (user_id, is_active, status, detected_at desc);

alter table public.agent_alerts enable row level security;
revoke all on table public.agent_alerts from anon, authenticated;
grant select on table public.agent_alerts to authenticated;
grant update (status, attended_at) on table public.agent_alerts to authenticated;

drop policy if exists agent_alerts_select_own on public.agent_alerts;
create policy agent_alerts_select_own
  on public.agent_alerts for select to authenticated
  using (
    (select auth.uid()) = user_id
    and coalesce(((select auth.jwt()) -> 'app_metadata' ->> 'farmi_active')::boolean, true) = true
  );

drop policy if exists agent_alerts_update_own on public.agent_alerts;
create policy agent_alerts_update_own
  on public.agent_alerts for update to authenticated
  using (
    (select auth.uid()) = user_id
    and coalesce(((select auth.jwt()) -> 'app_metadata' ->> 'farmi_active')::boolean, true) = true
  )
  with check (
    (select auth.uid()) = user_id
    and coalesce(((select auth.jwt()) -> 'app_metadata' ->> 'farmi_active')::boolean, true) = true
    and status in ('pending','attended')
    and ((status = 'pending' and attended_at is null) or (status = 'attended' and attended_at is not null))
  );

create or replace function private.refresh_agent_alerts()
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_today date := (now() at time zone 'America/Tegucigalpa')::date;
  v_count integer := 0;
begin
  create temporary table agent_alert_stage (
    user_id uuid not null,
    alert_key text not null,
    title text not null,
    detail text not null,
    category text not null,
    severity text not null,
    primary key (user_id, alert_key)
  ) on commit drop;

  -- Inventory at or below its configured minimum.
  insert into pg_temp.agent_alert_stage
  select s.user_id,
    'stock:' || coalesce(p->>'id', md5(p::text)) || ':' ||
      coalesce(p->>'stock','0') || ':' || coalesce(p->>'minStock','0'),
    case when coalesce(case when pg_input_is_valid(p->>'stock','numeric') then (p->>'stock')::numeric end,0) <= 0
      then 'Producto agotado: ' || coalesce(p->>'name','Producto')
      else 'Stock bajo: ' || coalesce(p->>'name','Producto') end,
    'Existencia actual: ' || coalesce(p->>'stock','0') ||
      ' · Mínimo configurado: ' || coalesce(p->>'minStock','0') ||
      '. Verifica pedidos pendientes y disponibilidad antes de reponer.',
    'Inventario',
    case when coalesce(case when pg_input_is_valid(p->>'stock','numeric') then (p->>'stock')::numeric end,0) <= 0
      then 'critical' else 'warning' end
  from public.erp_state s
  join auth.users u on u.id = s.user_id
  cross join lateral jsonb_array_elements(
    case when jsonb_typeof(s.state->'products')='array' then s.state->'products' else '[]'::jsonb end
  ) p
  where coalesce(case when pg_input_is_valid(u.raw_app_meta_data->>'farmi_active','boolean')
    then (u.raw_app_meta_data->>'farmi_active')::boolean end, true)
    and (u.banned_until is null or u.banned_until <= now())
    and coalesce(case when pg_input_is_valid(p->>'stock','numeric') then (p->>'stock')::numeric end,0)
      <= coalesce(case when pg_input_is_valid(p->>'minStock','numeric') then (p->>'minStock')::numeric end,0);

  -- Expired products and products expiring within 90 days.
  insert into pg_temp.agent_alert_stage
  select s.user_id,
    'expiry:' || coalesce(p->>'id',md5(p::text)) || ':' || (p->>'expiry'),
    case when (p->>'expiry')::date < v_today
      then 'Producto vencido: ' || coalesce(p->>'name','Producto')
      else 'Próximo vencimiento: ' || coalesce(p->>'name','Producto') end,
    case when (p->>'expiry')::date < v_today
      then 'Venció hace ' || (v_today-(p->>'expiry')::date)::text || ' días.'
      else 'Vence ' || case when (p->>'expiry')::date=v_today then 'hoy' else 'en ' || ((p->>'expiry')::date-v_today)::text || ' días' end || '.' end ||
      ' Lote: ' || coalesce(nullif(p->>'lot',''),'No registrado') ||
      ' · Existencia: ' || coalesce(p->>'stock','0') ||
      '. Requiere verificación física y aplicación del procedimiento de farmacia.',
    'Vencimientos',
    case when (p->>'expiry')::date < v_today then 'critical'
      when (p->>'expiry')::date <= v_today+30 then 'warning' else 'info' end
  from public.erp_state s
  join auth.users u on u.id=s.user_id
  cross join lateral jsonb_array_elements(
    case when jsonb_typeof(s.state->'products')='array' then s.state->'products' else '[]'::jsonb end
  ) p
  where coalesce(case when pg_input_is_valid(u.raw_app_meta_data->>'farmi_active','boolean')
    then (u.raw_app_meta_data->>'farmi_active')::boolean end, true)
    and (u.banned_until is null or u.banned_until <= now())
    and pg_input_is_valid(p->>'expiry','date')
    and (p->>'expiry')::date <= v_today+90;

  -- Overdue receivables.
  insert into pg_temp.agent_alert_stage
  select s.user_id,
    'ar:' || coalesce(r->>'id',md5(r::text)) || ':' ||
      round(balance.amount,2)::text || ':' || (r->>'dueDate'),
    'Cuenta por cobrar vencida: ' || coalesce(r->>'customer','Cliente'),
    'Saldo pendiente: L ' || round(balance.amount,2)::text ||
      ' · Vencimiento: ' || (r->>'dueDate') ||
      '. Confirma el estado de cuenta antes de contactar al cliente.',
    'Cuentas por cobrar','warning'
  from public.erp_state s
  join auth.users u on u.id=s.user_id
  cross join lateral jsonb_array_elements(
    case when jsonb_typeof(s.state->'receivables')='array' then s.state->'receivables' else '[]'::jsonb end
  ) r
  cross join lateral (
    select greatest(0,
      coalesce(case when pg_input_is_valid(r->>'total','numeric') then (r->>'total')::numeric end,0)
      + coalesce(case when pg_input_is_valid(r->>'debitNotes','numeric') then (r->>'debitNotes')::numeric end,0)
      - coalesce(case when pg_input_is_valid(r->>'paid','numeric') then (r->>'paid')::numeric end,0)
      - coalesce(case when pg_input_is_valid(r->>'creditNotes','numeric') then (r->>'creditNotes')::numeric end,0)
    ) as amount
  ) balance
  where coalesce(case when pg_input_is_valid(u.raw_app_meta_data->>'farmi_active','boolean')
    then (u.raw_app_meta_data->>'farmi_active')::boolean end, true)
    and (u.banned_until is null or u.banned_until <= now())
    and pg_input_is_valid(r->>'dueDate','date')
    and (r->>'dueDate')::date < v_today
    and balance.amount > 0;

  -- Overdue payables.
  insert into pg_temp.agent_alert_stage
  select s.user_id,
    'ap:' || coalesce(p->>'id',md5(p::text)) || ':' ||
      round(balance.amount,2)::text || ':' || (p->>'dueDate'),
    'Cuenta por pagar vencida: ' || coalesce(p->>'supplier','Proveedor'),
    'Saldo pendiente: L ' || round(balance.amount,2)::text ||
      ' · Vencimiento: ' || (p->>'dueDate') ||
      '. Verifica caja y condiciones con el proveedor antes de programar el pago.',
    'Cuentas por pagar','warning'
  from public.erp_state s
  join auth.users u on u.id=s.user_id
  cross join lateral jsonb_array_elements(
    case when jsonb_typeof(s.state->'payables')='array' then s.state->'payables' else '[]'::jsonb end
  ) p
  cross join lateral (
    select greatest(0,
      coalesce(case when pg_input_is_valid(p->>'total','numeric') then (p->>'total')::numeric end,0)
      - coalesce(case when pg_input_is_valid(p->>'paid','numeric') then (p->>'paid')::numeric end,0)
    ) as amount
  ) balance
  where coalesce(case when pg_input_is_valid(u.raw_app_meta_data->>'farmi_active','boolean')
    then (u.raw_app_meta_data->>'farmi_active')::boolean end, true)
    and (u.banned_until is null or u.banned_until <= now())
    and pg_input_is_valid(p->>'dueDate','date')
    and (p->>'dueDate')::date < v_today
    and balance.amount > 0;

  -- Monthly expenses exceeding gross profit, only when sales exist.
  insert into pg_temp.agent_alert_stage
  select s.user_id,
    'expense-margin:' || to_char(v_today,'YYYY-MM') || ':' ||
      round(monthly.profit,2)::text || ':' || round(monthly.expenses,2)::text,
    'Gastos superiores a la utilidad bruta del mes',
    'Utilidad bruta registrada: L ' || round(monthly.profit,2)::text ||
      ' · Gastos registrados: L ' || round(monthly.expenses,2)::text ||
      '. Revisa que los registros estén completos y clasificados correctamente.',
    'Finanzas','warning'
  from public.erp_state s
  join auth.users u on u.id=s.user_id
  cross join lateral (
    select
      coalesce((select sum(case when pg_input_is_valid(x->>'profit','numeric') then (x->>'profit')::numeric else 0 end)
        from jsonb_array_elements(case when jsonb_typeof(s.state->'sales')='array' then s.state->'sales' else '[]'::jsonb end) x
        where left(coalesce(x->>'date',''),7)=to_char(v_today,'YYYY-MM')),0) as profit,
      coalesce((select sum(case when pg_input_is_valid(x->>'amount','numeric') then (x->>'amount')::numeric else 0 end)
        from jsonb_array_elements(case when jsonb_typeof(s.state->'expenses')='array' then s.state->'expenses' else '[]'::jsonb end) x
        where left(coalesce(x->>'date',''),7)=to_char(v_today,'YYYY-MM')),0) as expenses,
      coalesce((select sum(case when pg_input_is_valid(x->>'total','numeric') then (x->>'total')::numeric else 0 end)
        from jsonb_array_elements(case when jsonb_typeof(s.state->'sales')='array' then s.state->'sales' else '[]'::jsonb end) x
        where left(coalesce(x->>'date',''),7)=to_char(v_today,'YYYY-MM')),0) as sales
  ) monthly
  where coalesce(case when pg_input_is_valid(u.raw_app_meta_data->>'farmi_active','boolean')
    then (u.raw_app_meta_data->>'farmi_active')::boolean end, true)
    and (u.banned_until is null or u.banned_until <= now())
    and monthly.sales > 0 and monthly.expenses > monthly.profit;

  -- Mark alerts that no longer match current ERP data as resolved.
  update public.agent_alerts a
  set is_active=false, resolved_at=now()
  where a.is_active
    and not exists (
      select 1 from pg_temp.agent_alert_stage st
      where st.user_id=a.user_id and st.alert_key=a.alert_key
    );

  -- Preserve "attended" while an alert remains active. If it disappears and
  -- later returns, reactivate it as pending.
  insert into public.agent_alerts
    (user_id,alert_key,title,detail,category,severity,status,is_active,detected_at,last_seen_at)
  select user_id,alert_key,title,detail,category,severity,'pending',true,now(),now()
  from pg_temp.agent_alert_stage
  on conflict (user_id,alert_key) do update
  set title=excluded.title,
      detail=excluded.detail,
      category=excluded.category,
      severity=excluded.severity,
      is_active=true,
      last_seen_at=now(),
      resolved_at=null,
      status=case when public.agent_alerts.is_active then public.agent_alerts.status else 'pending' end,
      attended_at=case when public.agent_alerts.is_active then public.agent_alerts.attended_at else null end;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

alter function private.refresh_agent_alerts() owner to postgres;
revoke all on function private.refresh_agent_alerts() from public, anon, authenticated;
grant execute on function private.refresh_agent_alerts() to postgres;

select cron.schedule(
  'farmi-agent-alerts-refresh',
  '0 */2 * * *',
  'select private.refresh_agent_alerts();'
);
