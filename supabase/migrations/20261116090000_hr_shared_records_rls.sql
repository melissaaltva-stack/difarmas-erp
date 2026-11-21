-- Shared human-resources records for the single-company DIFARMAS ERP.
-- Access is granted from trusted app_metadata claims only.
create table if not exists public.hr_employees (
  id text primary key,
  employee_code text not null,
  full_name text not null,
  position text not null,
  department text not null default '',
  phone text not null default '',
  email text not null default '',
  hire_date date not null,
  contract_type text not null check (contract_type in ('Permanente','Temporal','Por servicios')),
  status text not null check (status in ('Activo','Inactivo')),
  emergency_contact text not null default '',
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists hr_employees_employee_code_ci_uidx
  on public.hr_employees (lower(employee_code));
create index if not exists hr_employees_status_name_idx
  on public.hr_employees (status, full_name);

create table if not exists public.hr_attendance (
  id text primary key,
  employee_id text not null references public.hr_employees(id) on delete cascade,
  attendance_date date not null,
  status text not null check (status in ('Presente','Tardanza','Ausente','Permiso','Vacaciones')),
  check_in time,
  check_out time,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint hr_attendance_employee_date_unique unique (employee_id, attendance_date)
);
create index if not exists hr_attendance_date_idx
  on public.hr_attendance (attendance_date desc, employee_id);

create table if not exists public.hr_leave_requests (
  id text primary key,
  employee_id text not null references public.hr_employees(id) on delete cascade,
  request_type text not null check (request_type in ('Vacaciones','Permiso personal','Asunto familiar','Otro')),
  start_date date not null,
  end_date date not null,
  days integer not null check (days > 0),
  reason text not null default '',
  status text not null default 'Pendiente' check (status in ('Pendiente','Aprobado','Rechazado')),
  requested_at timestamptz not null default now(),
  reviewed_at timestamptz,
  constraint hr_leave_dates_valid check (end_date >= start_date)
);
create index if not exists hr_leave_status_start_idx
  on public.hr_leave_requests (status, start_date desc);
create index if not exists hr_leave_employee_dates_idx
  on public.hr_leave_requests (employee_id, start_date, end_date);

comment on table public.hr_employees is 'Shared DIFARMAS HR employee directory. Accessible only to active app roles authorized for RRHH.';
comment on table public.hr_attendance is 'Shared DIFARMAS HR daily attendance records.';
comment on table public.hr_leave_requests is 'Shared DIFARMAS HR leave and vacation requests.';

alter table public.hr_employees enable row level security;
alter table public.hr_attendance enable row level security;
alter table public.hr_leave_requests enable row level security;

revoke all on table public.hr_employees, public.hr_attendance, public.hr_leave_requests from public, anon, authenticated;
grant select, insert, update, delete on table public.hr_employees, public.hr_attendance, public.hr_leave_requests to authenticated;

drop policy if exists hr_employees_authorized_access on public.hr_employees;
create policy hr_employees_authorized_access
  on public.hr_employees for all to authenticated
  using (
    ((select auth.jwt()) -> 'app_metadata' ->> 'farmi_active') = 'true'
    and (
      ((select auth.jwt()) -> 'app_metadata' ->> 'farmi_role') = 'Administrador'
      or (
        ((select auth.jwt()) -> 'app_metadata' ->> 'farmi_role') in ('Supervisor','RRHH')
        and coalesce(((select auth.jwt()) -> 'app_metadata' -> 'farmi_permissions'), '[]'::jsonb) @> '["rrhh"]'::jsonb
      )
    )
  )
  with check (
    ((select auth.jwt()) -> 'app_metadata' ->> 'farmi_active') = 'true'
    and (
      ((select auth.jwt()) -> 'app_metadata' ->> 'farmi_role') = 'Administrador'
      or (
        ((select auth.jwt()) -> 'app_metadata' ->> 'farmi_role') in ('Supervisor','RRHH')
        and coalesce(((select auth.jwt()) -> 'app_metadata' -> 'farmi_permissions'), '[]'::jsonb) @> '["rrhh"]'::jsonb
      )
    )
  );

drop policy if exists hr_attendance_authorized_access on public.hr_attendance;
create policy hr_attendance_authorized_access
  on public.hr_attendance for all to authenticated
  using (
    ((select auth.jwt()) -> 'app_metadata' ->> 'farmi_active') = 'true'
    and (
      ((select auth.jwt()) -> 'app_metadata' ->> 'farmi_role') = 'Administrador'
      or (
        ((select auth.jwt()) -> 'app_metadata' ->> 'farmi_role') in ('Supervisor','RRHH')
        and coalesce(((select auth.jwt()) -> 'app_metadata' -> 'farmi_permissions'), '[]'::jsonb) @> '["rrhh"]'::jsonb
      )
    )
  )
  with check (
    ((select auth.jwt()) -> 'app_metadata' ->> 'farmi_active') = 'true'
    and (
      ((select auth.jwt()) -> 'app_metadata' ->> 'farmi_role') = 'Administrador'
      or (
        ((select auth.jwt()) -> 'app_metadata' ->> 'farmi_role') in ('Supervisor','RRHH')
        and coalesce(((select auth.jwt()) -> 'app_metadata' -> 'farmi_permissions'), '[]'::jsonb) @> '["rrhh"]'::jsonb
      )
    )
  );

drop policy if exists hr_leave_requests_authorized_access on public.hr_leave_requests;
create policy hr_leave_requests_authorized_access
  on public.hr_leave_requests for all to authenticated
  using (
    ((select auth.jwt()) -> 'app_metadata' ->> 'farmi_active') = 'true'
    and (
      ((select auth.jwt()) -> 'app_metadata' ->> 'farmi_role') = 'Administrador'
      or (
        ((select auth.jwt()) -> 'app_metadata' ->> 'farmi_role') in ('Supervisor','RRHH')
        and coalesce(((select auth.jwt()) -> 'app_metadata' -> 'farmi_permissions'), '[]'::jsonb) @> '["rrhh"]'::jsonb
      )
    )
  )
  with check (
    ((select auth.jwt()) -> 'app_metadata' ->> 'farmi_active') = 'true'
    and (
      ((select auth.jwt()) -> 'app_metadata' ->> 'farmi_role') = 'Administrador'
      or (
        ((select auth.jwt()) -> 'app_metadata' ->> 'farmi_role') in ('Supervisor','RRHH')
        and coalesce(((select auth.jwt()) -> 'app_metadata' -> 'farmi_permissions'), '[]'::jsonb) @> '["rrhh"]'::jsonb
      )
    )
  );

-- Enable Realtime delivery so authorized sessions can see changes made by another account.
do $$
declare
  v_table text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach v_table in array array['hr_employees','hr_attendance','hr_leave_requests'] loop
      if not exists (
        select 1 from pg_publication_tables
        where pubname = 'supabase_realtime'
          and schemaname = 'public'
          and tablename = v_table
      ) then
        execute format('alter publication supabase_realtime add table public.%I', v_table);
      end if;
    end loop;
  end if;
end;
$$;
