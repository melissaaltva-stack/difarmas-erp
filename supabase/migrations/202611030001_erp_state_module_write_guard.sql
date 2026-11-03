-- Farmi: enforce module-level permissions for changes to an existing ERP snapshot.
-- This complements RLS role checks; it does not modify existing snapshot data.
-- Unknown snapshot keys fail closed until they are explicitly mapped below.

create or replace function public.farmi_can_write_snapshot_key(p_key text, p_permissions jsonb)
returns boolean
language sql
immutable
set search_path = pg_catalog
as $$
  select case p_key
    when 'customers' then p_permissions ? 'clientes'
    when 'quotes' then p_permissions ? 'cotizaciones'
    when 'suppliers' then (p_permissions ? 'proveedores' or p_permissions ? 'compras')
    when 'products' then (p_permissions ? 'inventario' or p_permissions ? 'compras')
    when 'sales' then (p_permissions ? 'ventas' or p_permissions ? 'facturacion_estandar')
    when 'saleAdjustments' then (p_permissions ? 'ventas' or p_permissions ? 'facturacion_estandar')
    when 'purchases' then (p_permissions ? 'compras' or p_permissions ? 'proveedores')
    when 'purchaseCostHistory' then (p_permissions ? 'compras' or p_permissions ? 'inventario')
    when 'inventoryMovements' then (p_permissions ? 'inventario' or p_permissions ? 'ventas' or p_permissions ? 'compras')
    when 'expenses' then p_permissions ? 'finanzas'
    when 'receivables' then (p_permissions ? 'cuentas_cobrar' or p_permissions ? 'finanzas' or p_permissions ? 'ventas' or p_permissions ? 'facturacion_estandar')
    when 'payables' then (p_permissions ? 'cuentas_pagar' or p_permissions ? 'finanzas' or p_permissions ? 'compras')
    when 'cashClosures' then p_permissions ? 'finanzas'
    when 'cashMovements' then p_permissions ? 'finanzas'
    when 'paymentTransactions' then (p_permissions ? 'finanzas' or p_permissions ? 'cuentas_cobrar' or p_permissions ? 'cuentas_pagar')
    when 'monthlyGoal' then p_permissions ? 'finanzas'
    when 'fixedExpenses' then p_permissions ? 'finanzas'
    when 'missingProductRequests' then (p_permissions ? 'compras' or p_permissions ? 'ventas')
    when 'supplierReturns' then (p_permissions ? 'compras' or p_permissions ? 'proveedores' or p_permissions ? 'finanzas')
    when 'supplierCredits' then (p_permissions ? 'compras' or p_permissions ? 'proveedores' or p_permissions ? 'finanzas')
    when 'settings' then p_permissions ? 'configuracion'
    else false
  end;
$$;

create or replace function public.farmi_enforce_snapshot_module_permissions()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_metadata jsonb := coalesce(auth.jwt() -> 'app_metadata', '{}'::jsonb);
  v_role text := v_metadata ->> 'farmi_role';
  v_permissions jsonb := coalesce(v_metadata -> 'farmi_permissions', '[]'::jsonb);
  v_key text;
begin
  if coalesce((v_metadata ->> 'farmi_active')::boolean, true) is not true then
    raise exception 'La cuenta está desactivada.' using errcode = '42501';
  end if;

  if v_metadata ->> 'farmi_admin' = 'true' or v_role = 'Administrador' then
    return new;
  end if;

  if jsonb_typeof(v_permissions) <> 'array' then
    raise exception 'No se pudo verificar la lista de permisos del usuario.' using errcode = '42501';
  end if;

  for v_key in
    select changed.key
    from (
      select jsonb_object_keys(coalesce(old.state, '{}'::jsonb)) as key
      union
      select jsonb_object_keys(coalesce(new.state, '{}'::jsonb)) as key
    ) as changed
    where (coalesce(old.state, '{}'::jsonb) -> changed.key)
      is distinct from (coalesce(new.state, '{}'::jsonb) -> changed.key)
  loop
    if not public.farmi_can_write_snapshot_key(v_key, v_permissions) then
      raise exception 'Tu usuario no tiene permiso para modificar el módulo asociado al dato: %.', v_key
        using errcode = '42501';
    end if;
  end loop;

  return new;
end;
$$;

drop trigger if exists farmi_erp_state_module_write_guard on public.erp_state;
create trigger farmi_erp_state_module_write_guard
before update of state on public.erp_state
for each row
execute function public.farmi_enforce_snapshot_module_permissions();

-- Initial INSERTs remain governed by erp_state_insert_own. This trigger guards
-- subsequent snapshot updates, including the atomic supplier-credit RPC.
