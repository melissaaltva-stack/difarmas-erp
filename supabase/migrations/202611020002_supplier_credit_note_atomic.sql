-- Farmi: atomically resolve a supplier credit note in the per-user ERP snapshot.
-- The row lock + status transition make the operation idempotent across devices.
-- SECURITY INVOKER is intentional: the caller must pass erp_state RLS as well.
-- The caller must also hold at least one relevant module permission in trusted app_metadata.

create or replace function public.resolve_supplier_credit_note(p_return_id bigint)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_jwt jsonb := auth.jwt();
  v_user_id uuid := auth.uid();
  v_role text := v_jwt -> 'app_metadata' ->> 'farmi_role';
  v_active boolean := coalesce((v_jwt -> 'app_metadata' ->> 'farmi_active')::boolean, false);
  v_permissions jsonb := v_jwt #> '{app_metadata,farmi_permissions}';
  v_state jsonb;
  v_updated_at timestamptz;
  v_returns jsonb;
  v_purchases jsonb;
  v_payables jsonb;
  v_credits jsonb;
  v_return jsonb;
  v_purchase jsonb;
  v_payable jsonb;
  v_supplier text;
  v_reference text;
  v_purchase_id bigint;
  v_payable_id bigint;
  v_note numeric;
  v_balance numeric := 0;
  v_reduction numeric := 0;
  v_remainder numeric := 0;
  v_credit_id bigint;
  v_credit jsonb;
  v_new_state jsonb;
begin
  if v_user_id is null then
    raise exception 'Debes iniciar sesión para registrar la nota de crédito.' using errcode = '42501';
  end if;
  if not v_active
     or v_role is null
     or v_role not in ('Administrador','Supervisor','Compras','Finanzas') then
    raise exception 'Tu usuario no tiene permiso para registrar notas de crédito de proveedores.' using errcode = '42501';
  end if;
  if v_permissions is null
     or jsonb_typeof(v_permissions) <> 'array'
     or not (v_permissions ?| array['proveedores','compras','cuentas_pagar','finanzas']) then
    raise exception 'Tu cuenta no tiene permisos del módulo necesarios para esta operación.' using errcode = '42501';
  end if;
  if p_return_id is null or p_return_id <= 0 then
    raise exception 'La devolución indicada no es válida.' using errcode = '22023';
  end if;

  select state, updated_at into v_state, v_updated_at
  from public.erp_state
  where user_id = v_user_id
  for update;

  if not found then
    raise exception 'No existe el registro ERP de esta cuenta.' using errcode = 'P0002';
  end if;

  v_returns := coalesce(v_state -> 'supplierReturns', '[]'::jsonb);
  v_purchases := coalesce(v_state -> 'purchases', '[]'::jsonb);
  v_payables := coalesce(v_state -> 'payables', '[]'::jsonb);
  v_credits := coalesce(v_state -> 'supplierCredits', '[]'::jsonb);

  if jsonb_typeof(v_returns) <> 'array' or jsonb_typeof(v_purchases) <> 'array'
     or jsonb_typeof(v_payables) <> 'array' or jsonb_typeof(v_credits) <> 'array' then
    raise exception 'Los datos de devoluciones, compras, cuentas por pagar o créditos no tienen un formato válido.' using errcode = '22023';
  end if;

  select item into v_return
  from jsonb_array_elements(v_returns) item
  where item ->> 'id' = p_return_id::text
  limit 1;

  if v_return is null then
    raise exception 'No se encontró la devolución indicada.' using errcode = 'P0002';
  end if;
  if (v_return ->> 'status') is distinct from 'Enviado al proveedor' then
    raise exception 'Esta devolución ya fue procesada o cambió de estado. Recarga el ERP.' using errcode = '23505';
  end if;
  if exists (
    select 1 from jsonb_array_elements(v_credits) item
    where item ->> 'sourceReturnId' = p_return_id::text
  ) then
    raise exception 'Ya existe un crédito registrado para esta devolución.' using errcode = '23505';
  end if;

  v_supplier := btrim(coalesce(v_return ->> 'supplier',''));
  v_reference := lower(btrim(coalesce(v_return ->> 'purchaseReference','')));
  v_note := (v_return ->> 'totalCost')::numeric;
  if v_supplier = '' or v_reference = '' or v_note is null or v_note <= 0 then
    raise exception 'La devolución no contiene proveedor, factura vinculada o importe válido.' using errcode = '22023';
  end if;

  select item into v_purchase
  from jsonb_array_elements(v_purchases) item
  where lower(btrim(coalesce(item ->> 'supplier',''))) = lower(v_supplier)
    and (item ->> 'id' = v_reference or lower(btrim(coalesce(item ->> 'invoiceNumber',''))) = v_reference)
  order by case when item ->> 'id' = v_reference then 0 else 1 end
  limit 1;

  if v_purchase is null then
    raise exception 'No se encontró la compra vinculada a esta devolución.' using errcode = 'P0002';
  end if;
  v_purchase_id := (v_purchase ->> 'id')::bigint;

  select item into v_payable
  from jsonb_array_elements(v_payables) item
  where lower(btrim(coalesce(item ->> 'supplier',''))) = lower(v_supplier)
    and (
      item ->> 'purchaseId' = v_purchase_id::text
      or (
        nullif(btrim(coalesce(v_purchase ->> 'invoiceNumber','')),'') is not null
        and lower(btrim(coalesce(item ->> 'invoiceNumber',''))) = lower(btrim(v_purchase ->> 'invoiceNumber'))
      )
    )
  order by case when item ->> 'purchaseId' = v_purchase_id::text then 0 else 1 end
  limit 1;

  if v_payable is not null then
    v_payable_id := (v_payable ->> 'id')::bigint;
    v_balance := greatest(0, (v_payable ->> 'total')::numeric - (v_payable ->> 'paid')::numeric);
  end if;

  v_reduction := least(v_note, v_balance);
  v_remainder := round(v_note - v_reduction, 2);

  if v_payable is not null and v_reduction > 0 then
    select coalesce(jsonb_agg(
      case when item ->> 'id' = v_payable_id::text
        then jsonb_set(item, '{total}', to_jsonb(greatest((item ->> 'paid')::numeric, (item ->> 'total')::numeric - v_reduction)), true)
        else item
      end
    ), '[]'::jsonb) into v_payables
    from jsonb_array_elements(v_payables) item;
  end if;

  if v_remainder > 0 then
    select coalesce(max((item ->> 'id')::bigint),0)+1 into v_credit_id
    from jsonb_array_elements(v_credits) item;
    v_credit := jsonb_build_object(
      'id',v_credit_id,
      'supplier',v_supplier,
      'sourceReturnId',p_return_id,
      'sourcePurchaseId',v_purchase_id,
      'sourceReference',coalesce(nullif(btrim(v_purchase ->> 'invoiceNumber'),''),v_purchase_id::text),
      'amount',v_remainder,
      'remainingBalance',v_remainder,
      'createdAt',clock_timestamp(),
      'applications','[]'::jsonb
    );
    v_credits := v_credits || jsonb_build_array(v_credit);
  end if;

  select coalesce(jsonb_agg(
    case when item ->> 'id' = p_return_id::text
      then jsonb_set(item, '{status}', to_jsonb('Nota de crédito recibida'::text), true)
      else item
    end
  ), '[]'::jsonb) into v_returns
  from jsonb_array_elements(v_returns) item;

  v_new_state := jsonb_set(
    jsonb_set(
      jsonb_set(v_state, '{supplierReturns}', v_returns, true),
      '{payables}', v_payables, true
    ),
    '{supplierCredits}', v_credits, true
  );

  update public.erp_state
  set state = v_new_state,
      updated_at = greatest(clock_timestamp(), v_updated_at + interval '1 millisecond')
  where user_id = v_user_id
  returning updated_at into v_updated_at;

  return jsonb_build_object(
    'supplierReturns', v_returns,
    'payables', v_payables,
    'supplierCredits', v_credits,
    'updatedAt', v_updated_at
  );
end;
$$;

revoke all on function public.resolve_supplier_credit_note(bigint) from public;
revoke all on function public.resolve_supplier_credit_note(bigint) from anon;
grant execute on function public.resolve_supplier_credit_note(bigint) to authenticated;
