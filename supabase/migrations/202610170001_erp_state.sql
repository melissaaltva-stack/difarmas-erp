-- DIFARMÁS ERP - first centralized persistence layer.
-- One private snapshot per authenticated account for the MVP.
-- Never put a service_role key in browser code.

create table if not exists public.erp_state (
  user_id uuid primary key references auth.users (id) on delete cascade,
  state jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  constraint erp_state_object check (jsonb_typeof(state) = 'object')
);

alter table public.erp_state enable row level security;

revoke all on table public.erp_state from anon;
revoke all on table public.erp_state from authenticated;
grant select, insert, update on table public.erp_state to authenticated;

drop policy if exists "erp_state_select_own" on public.erp_state;
create policy "erp_state_select_own"
  on public.erp_state for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "erp_state_insert_own" on public.erp_state;
create policy "erp_state_insert_own"
  on public.erp_state for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "erp_state_update_own" on public.erp_state;
create policy "erp_state_update_own"
  on public.erp_state for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- Deliberately no DELETE policy: browser clients cannot delete the snapshot.
