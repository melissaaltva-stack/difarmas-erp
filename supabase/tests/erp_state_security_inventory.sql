-- FARMI / DIFARMAS ERP — inventario de seguridad de solo lectura
-- Ejecutar en Supabase SQL Editor con un rol autorizado para inspeccionar catálogo.
-- No modifica datos, políticas, privilegios ni estructura. No contiene JWT ni secretos.
-- Ejecutar primero en staging si el proyecto restringe visibilidad del catálogo.

-- 1) Estado RLS de tablas y vistas del esquema public.
select
  n.nspname as schema_name,
  c.relname as object_name,
  c.relkind as object_type,
  c.relrowsecurity as rls_enabled,
  c.relforcerowsecurity as rls_forced
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind in ('r', 'p', 'v', 'm', 'f')
order by c.relname;

-- 2) Todas las políticas RLS en public; revisar especialmente policies PERMISSIVE
-- porque PostgreSQL las combina con OR. No filtrar solo por erp_state.
select
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual as using_expression,
  with_check
from pg_policies
where schemaname = 'public'
order by tablename, policyname;

-- 3) Políticas específicas de erp_state, incluidas las expresiones completas.
select
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual as using_expression,
  with_check
from pg_policies
where schemaname = 'public'
  and tablename = 'erp_state'
order by policyname;

-- 4) Privilegios efectivos declarados para anon/authenticated/service_role.
-- Incluye tabla, secuencia y funciones; los privilegios de service_role son sensibles.
select
  grantee,
  table_schema,
  table_name,
  privilege_type,
  is_grantable
from information_schema.role_table_grants
where table_schema = 'public'
  and grantee in ('anon', 'authenticated', 'service_role')
order by table_name, grantee, privilege_type;

select
  grantee,
  routine_schema,
  routine_name,
  privilege_type,
  is_grantable
from information_schema.routine_privileges
where routine_schema = 'public'
  and grantee in ('anon', 'authenticated', 'service_role')
order by routine_name, grantee, privilege_type;

-- 5) Triggers instalados en public. Investigar cualquier trigger que pueda alterar
-- erp_state o tablas financieras/inventario de forma indirecta.
select
  n.nspname as schema_name,
  c.relname as table_name,
  t.tgname as trigger_name,
  pg_get_triggerdef(t.oid, true) as trigger_definition,
  p.proname as function_name,
  pn.nspname as function_schema
from pg_trigger t
join pg_class c on c.oid = t.tgrelid
join pg_namespace n on n.oid = c.relnamespace
join pg_proc p on p.oid = t.tgfoid
join pg_namespace pn on pn.oid = p.pronamespace
where not t.tgisinternal
  and n.nspname = 'public'
order by c.relname, t.tgname;

-- 6) Funciones SECURITY DEFINER en public. Revisar cuerpo, search_path,
-- permisos EXECUTE y validación explícita de identidad/rol.
select
  n.nspname as function_schema,
  p.proname as function_name,
  pg_get_function_identity_arguments(p.oid) as identity_arguments,
  p.prosecdef as security_definer,
  p.proconfig as function_settings,
  pg_get_userbyid(p.proowner) as owner,
  pg_get_functiondef(p.oid) as function_definition
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.prosecdef
order by p.proname;

-- 7) Roles relevantes y atributos de bypass/superusuario.
-- No devuelve contraseñas ni tokens.
select
  rolname,
  rolsuper,
  rolinherit,
  rolcreaterole,
  rolcreatedb,
  rolcanlogin,
  rolreplication,
  rolbypassrls
from pg_roles
where rolname in ('anon', 'authenticated', 'service_role', 'postgres', 'supabase_admin')
order by rolname;

-- 8) Columnas de erp_state y restricciones declaradas.
select
  column_name,
  data_type,
  is_nullable,
  column_default
from information_schema.columns
where table_schema = 'public'
  and table_name = 'erp_state'
order by ordinal_position;

select
  conname,
  contype,
  pg_get_constraintdef(oid, true) as constraint_definition
from pg_constraint
where conrelid = to_regclass('public.erp_state')
order by conname;

-- 9) Índices de erp_state.
select
  indexname,
  indexdef
from pg_indexes
where schemaname = 'public'
  and tablename = 'erp_state'
order by indexname;

-- 10) Grants a nivel de esquema public.
select
  grantee,
  privilege_type,
  is_grantable
from information_schema.schema_privileges
where schema_name = 'public'
  and grantee in ('anon', 'authenticated', 'service_role')
order by grantee, privilege_type;

-- 11) Inventario de vistas que podrían exponer datos de tablas protegidas.
select
  schemaname,
  viewname,
  definition
from pg_views
where schemaname = 'public'
order by viewname;

-- Interpretación:
-- * La ausencia de filas visibles no demuestra ausencia de objetos si el rol
--   ejecutor no tiene permisos de catálogo suficientes.
-- * Confirmar que RLS está habilitado en cada tabla con datos sensibles.
-- * Revisar policies permisivas adicionales, grants directos, funciones
--   SECURITY DEFINER, vistas y triggers antes de aprobar cambios.
-- * No ejecutar pruebas de escritura sobre producción. Las pruebas de acceso
--   cruzado requieren usuarios JWT de prueba y un proyecto staging aislado.
