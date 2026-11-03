-- Farmi: enforce account status and read-only roles at the database boundary.
-- Roles are read from trusted Supabase app_metadata, matching App.tsx.
-- Existing account ownership and snapshot data are preserved.
-- Missing farmi_active claims fail closed. Current accounts were inventoried before
-- this tightening and all existing accounts explicitly carry farmi_active=true.

drop policy if exists "erp_state_select_own" on public.erp_state;
create policy "erp_state_select_own"
  on public.erp_state
  for select
  to authenticated
  using (
    (select auth.uid()) = user_id
    and coalesce(((select auth.jwt()) -> 'app_metadata' ->> 'farmi_active')::boolean, false) = true
  );

drop policy if exists "erp_state_insert_own" on public.erp_state;
create policy "erp_state_insert_own"
  on public.erp_state
  for insert
  to authenticated
  with check (
    (select auth.uid()) = user_id
    and coalesce(((select auth.jwt()) -> 'app_metadata' ->> 'farmi_active')::boolean, false) = true
    and ((select auth.jwt()) -> 'app_metadata' ->> 'farmi_role') in
      ('Administrador', 'Supervisor', 'Ventas', 'Compras', 'Finanzas')
  );

drop policy if exists "erp_state_update_own" on public.erp_state;
create policy "erp_state_update_own"
  on public.erp_state
  for update
  to authenticated
  using (
    (select auth.uid()) = user_id
    and coalesce(((select auth.jwt()) -> 'app_metadata' ->> 'farmi_active')::boolean, false) = true
    and ((select auth.jwt()) -> 'app_metadata' ->> 'farmi_role') in
      ('Administrador', 'Supervisor', 'Ventas', 'Compras', 'Finanzas')
  )
  with check (
    (select auth.uid()) = user_id
    and coalesce(((select auth.jwt()) -> 'app_metadata' ->> 'farmi_active')::boolean, false) = true
    and ((select auth.jwt()) -> 'app_metadata' ->> 'farmi_role') in
      ('Administrador', 'Supervisor', 'Ventas', 'Compras', 'Finanzas')
  );

-- Unknown/missing roles and Solo lectura fail closed for writes.
-- No DELETE policy is added.
-- Module-level authorization is deliberately NOT claimed here: the ERP snapshot
-- is monolithic and its business actions still need server-side operation guards.
