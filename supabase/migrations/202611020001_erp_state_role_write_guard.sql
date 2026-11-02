-- Farmi: enforce account status and read-only roles at the database boundary.
-- Keeps each account's existing snapshot and ownership model unchanged.
-- Apply this migration in the linked Supabase project's SQL Editor before relying on it.

drop policy if exists "erp_state_select_own" on public.erp_state;
create policy "erp_state_select_own"
  on public.erp_state
  for select
  to authenticated
  using (
    (select auth.uid()) = user_id
    and coalesce((auth.jwt() -> 'app_metadata' ->> 'farmi_active')::boolean, true) = true
  );

drop policy if exists "erp_state_insert_own" on public.erp_state;
create policy "erp_state_insert_own"
  on public.erp_state
  for insert
  to authenticated
  with check (
    (select auth.uid()) = user_id
    and coalesce((auth.jwt() -> 'app_metadata' ->> 'farmi_active')::boolean, true) = true
    and coalesce(auth.jwt() -> 'app_metadata' ->> 'farmi_role', '') <> 'Solo lectura'
  );

drop policy if exists "erp_state_update_own" on public.erp_state;
create policy "erp_state_update_own"
  on public.erp_state
  for update
  to authenticated
  using (
    (select auth.uid()) = user_id
    and coalesce((auth.jwt() -> 'app_metadata' ->> 'farmi_active')::boolean, true) = true
    and coalesce(auth.jwt() -> 'app_metadata' ->> 'farmi_role', '') <> 'Solo lectura'
  )
  with check (
    (select auth.uid()) = user_id
    and coalesce((auth.jwt() -> 'app_metadata' ->> 'farmi_active')::boolean, true) = true
    and coalesce(auth.jwt() -> 'app_metadata' ->> 'farmi_role', '') <> 'Solo lectura'
  );

-- No DELETE policy is added. Existing account ownership and snapshot data remain intact.
