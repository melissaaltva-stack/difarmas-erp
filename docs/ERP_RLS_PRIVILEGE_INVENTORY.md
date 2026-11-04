# Inventario de RLS, privilegios y sincronización de FARMI

**Rama:** `security/erp-state-permission-matrix`  
**Fecha de revisión:** 2026-11-02  
**Archivos revisados:** migración `202611020001_erp_state_role_write_guard.sql`, `src/services/remoteErpState.ts`, `src/hooks/useErpState.ts`, `src/App.tsx`, `src/domain/types.ts`, `api/admin-users.ts`.  
**Tipo de revisión:** estática sobre el contenido de la rama. No se consultó la base de datos Supabase conectada.

## 1. Conclusión

No es seguro considerar que la separación de permisos por módulo está aplicada en la base de datos. La política actual de `erp_state` limita el acceso a la fila del usuario y excluye de escritura a Solo lectura y roles desconocidos, pero permite que cualquier rol habilitado reemplace el JSONB completo. La autorización visual de `App.tsx` no sustituye RLS ni una autorización de servidor.

La aplicación usa un snapshot monolítico y autosave completo. Por tanto, no basta con añadir una comprobación superficial de claves JSON: las operaciones de negocio deben migrarse gradualmente a funciones transaccionales o tablas normalizadas, conservando la importación inicial y los datos actuales.

## 2. Inventario confirmado en código

### 2.1 Migración RLS revisada

La migración crea/reemplaza estas políticas nombradas:
- `erp_state_select_own`: SELECT para usuario propietario y `farmi_active` interpretado como verdadero por defecto.
- `erp_state_insert_own`: INSERT propio para Administrador, Supervisor, Ventas, Compras y Finanzas.
- `erp_state_update_own`: UPDATE propio para esos mismos roles.
- No agrega política DELETE.

La migración no contiene sentencias `GRANT`, `REVOKE`, triggers ni funciones SQL. Eso no demuestra que no existan en la base de datos: deben inventariarse en el entorno real o en un dump SQL de solo lectura.

**Límite importante de PostgreSQL RLS:** las políticas permisivas aplicables se combinan normalmente con OR. Reemplazar tres políticas por nombre no elimina otras políticas permisivas con nombres distintos. Es obligatorio listar todas las políticas efectivas de `public.erp_state`.

### 2.2 Privilegios de tabla

No hay evidencia en los archivos revisados para confirmar los grants efectivos de `anon`, `authenticated`, `service_role` ni otros roles SQL. RLS no otorga privilegios por sí mismo: el usuario también necesita privilegio SQL sobre la operación.

El inventario real debe obtener:
- `information_schema.role_table_grants` para `public.erp_state`.
- `pg_class.relrowsecurity` y `pg_class.relforcerowsecurity`.
- `pg_policies` para todas las políticas, no solo las tres esperadas.
- Políticas de cualquier tabla que contenga datos ERP.

No asumir que `FORCE ROW LEVEL SECURITY` está activado. El propietario de tabla y roles privilegiados pueden tener comportamientos distintos; `service_role` suele poder omitir RLS y nunca debe llegar al navegador.

### 2.3 Triggers y funciones privilegiadas

No se localizaron triggers ni funciones SQL en la migración revisada. No se puede concluir que no existan en Supabase. Se requiere inventario de:
- Triggers asociados a `erp_state` y tablas relacionadas.
- Funciones con `SECURITY DEFINER`, propietario, `search_path`, grants de ejecución y referencias a `auth.uid()`.
- Vistas y RPCs que lean o escriban datos ERP.
- Extensiones o funciones que cambien el contexto de seguridad.

Cualquier función `SECURITY DEFINER` debe fijar un `search_path` seguro, validar explícitamente al usuario y no confiar en parámetros de identidad enviados por el cliente.

## 3. Hallazgos de sincronización y autorización

### SYNC-04 — Primer snapshot remoto puede ser sembrado desde localStorage
**Severidad: alta; requiere diseño de migración, no parche inmediato.**

`useErpState` inicializa cada colección desde claves locales `difarmas_*`. Cuando no hay fila remota, permite autosave después de cargar. `remoteErpState.saveErpSnapshotNow` usa INSERT-only si no hay revisión observada, lo cual evita sobrescribir una fila concurrente, pero el primer payload puede contener datos locales completos.

La aplicación compara `difarmas_owner_user_id` para detectar cambio de cuenta y reinicia estados cuando detecta un propietario anterior distinto. Sin embargo, si no existe marcador de propietario previo, los datos locales preexistentes pueden ser importados a la primera cuenta que inicie sesión en ese navegador.

**No cambiar este comportamiento a ciegas:** algunos usuarios pueden depender de datos locales aún no importados. Debe existir un procedimiento explícito para identificar, revisar y aprobar la importación inicial.

### SYNC-05 — Un snapshot completo es el límite real de autorización actual
**Severidad: crítica para permisos por módulo.**

El autosave llama `saveErpSnapshot(userId, snapshot)` y reemplaza `state` completo. El control de revisión `updated_at` evita algunas carreras, pero no limita claves modificables. La actualización especial de cotizaciones mezcla únicamente `quotes`, pero sigue dependiendo de la autorización de UPDATE de la fila.

### SYNC-06 — Normalización no equivale a validación de dominio
**Severidad: alta.**

`normalizeSnapshot` valida que ciertas claves sean arreglos y que `monthlyGoal`/ `fixedExpenses` sean números finitos. No valida campos internos, IDs duplicados, importes no negativos, estados válidos, vínculos entre ventas y cuentas, consistencia de stock ni claves desconocidas. La normalización completa claves ausentes con arreglos vacíos o defaults.

Un snapshot puede superar esa validación estructural superficial y seguir siendo inconsistente o malicioso.

### APP-02 — El permiso de navegación no es control de acceso de datos
**Severidad: alta.**

`App.tsx` deriva permisos de `farmi_permissions` del JWT y oculta módulos. Los componentes reciben setters y callbacks de mutación. El usuario puede invocar la API de Supabase fuera de la interfaz. La política RLS no compara los permisos individuales.

### APP-03 — La metadata de usuario y la configuración del snapshot tienen distinta autoridad
`api/admin-users.ts` usa Admin API en servidor y guarda `farmi_role`, `farmi_permissions`, `farmi_active` en `app_metadata`. `settings.users` es una copia de configuración de interfaz y no debe autorizar operaciones. El frontend filtra claims por módulos conocidos, pero esto solo condiciona la navegación.

### ADMIN-03 — Cuenta sin claim activo puede verse activa en UI y API
La UI trata `farmi_active !== false` como activa y `safeUser` también interpreta ausencia como activa, salvo bloqueo de Auth. La política RLS aplica el mismo default permisivo. Un contrato más estricto requiere inventariar y normalizar metadata de las cuentas antes de cambiar la interpretación.

## 4. Consultas de inventario SQL para ejecutar solo en entorno de prueba o mediante acceso de solo lectura

Estas consultas son de inspección; no alteran datos. No se han ejecutado desde esta auditoría.

### Políticas RLS de erp_state

```sql
select schemaname, tablename, policyname, permissive, roles,
       cmd, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename = 'erp_state'
order by policyname;
```

### Estado RLS y propietario de tabla

```sql
select n.nspname as schema_name,
       c.relname as table_name,
       pg_get_userbyid(c.relowner) as owner,
       c.relrowsecurity as rls_enabled,
       c.relforcerowsecurity as force_rls
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname = 'erp_state';
```

### Privilegios SQL

```sql
select grantee, privilege_type, is_grantable
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name = 'erp_state'
order by grantee, privilege_type;
```

### Triggers

```sql
select t.tgname, pg_get_triggerdef(t.oid) as definition,
       p.proname as function_name
from pg_trigger t
join pg_class c on c.oid = t.tgrelid
join pg_namespace n on n.oid = c.relnamespace
join pg_proc p on p.oid = t.tgfoid
where n.nspname = 'public'
  and c.relname = 'erp_state'
  and not t.tgisinternal
order by t.tgname;
```

### Funciones SECURITY DEFINER relacionadas con esquema public

```sql
select n.nspname as schema_name, p.proname as function_name,
       pg_get_userbyid(p.proowner) as owner,
       p.proconfig as function_settings,
       pg_get_function_identity_arguments(p.oid) as arguments,
       p.proacl as privileges
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.prosecdef
order by p.proname;
```

### Funciones otorgadas a roles de cliente

```sql
select routine_schema, routine_name, grantee, privilege_type
from information_schema.routine_privileges
where routine_schema = 'public'
  and grantee in ('anon', 'authenticated', 'PUBLIC')
order by routine_name, grantee;
```

## 5. Matriz de pruebas RLS aisladas

Las pruebas deben usar JWT de prueba y filas ficticias. No ejecutar con credenciales ni datos de producción.

| Prueba | Identidad / operación | Verificación |
|---|---|---|
| P01 | Usuario A SELECT fila A | Devuelve su propia fila |
| P02 | Usuario A SELECT fila B | No devuelve fila ajena |
| P03 | Usuario A UPDATE fila B | Cero filas modificadas |
| P04 | Usuario A INSERT fila con user_id B | Denegado |
| P05 | Rol Ventas cambia solo customers | Permitido actualmente por política de rol; documentar limitación |
| P06 | Rol Ventas cambia products/settings/payables | También permitido actualmente; demuestra falta de separación por módulo |
| P07 | Solo lectura UPDATE propio | Denegado |
| P08 | Rol ausente/desconocido UPDATE | Denegado |
| P09 | `farmi_active=false` | SELECT/INSERT/UPDATE denegados |
| P10 | `farmi_active` ausente o NULL | Política actual lo interpreta como activo |
| P11 | `farmi_active` con texto inválido | Registrar error de conversión/denegación |
| P12 | DELETE propio | Denegado si no existe política/grant adicional |
| P13 | JWT viejo tras desactivar cuenta | Medir acceso hasta renovación/expiración |
| P14 | Dos sesiones con misma revisión | Una escritura condicional debe detectar conflicto |
| P15 | Examinar políticas adicionales | Ninguna política permisiva inesperada |
| P16 | Examinar grants | No hay privilegios de cliente inesperados |
| P17 | Examinar triggers/SECURITY DEFINER | No hay bypass o escritura indirecta no validada |
| P18 | INSERT snapshot con claves desconocidas | RLS actual no valida estructura; importador debe rechazar |

## 6. Reglas para la transición

1. No borrar, truncar ni recrear `erp_state`.
2. No convertir automáticamente todos los snapshots a un formato nuevo sin copia de seguridad y verificación por usuario.
3. No crear fila vacía al invitar: puede bloquear una importación inicial legítima.
4. No habilitar importación automática del snapshot local sin identificar su propietario y obtener una decisión explícita.
5. No conceder UPDATE genérico a roles funcionales cuando las operaciones se hayan trasladado a RPC.
6. Mantener el control optimista de revisión durante la transición; añadir idempotencia y transacciones en operaciones críticas.
7. Mantener la ausencia de política DELETE salvo decisión y diseño explícitos.
8. Nunca exponer service role al navegador.
9. Probar la migración y reversión en una copia aislada antes de considerar cualquier cambio en producción.

## 7. Estado de ejecución

- Revisión estática de archivos: completada para los archivos enumerados.
- Inventario efectivo de `pg_policies`, grants, triggers y funciones del proyecto conectado: pendiente; no se dispone de salida SQL de esa instancia.
- Pruebas PostgreSQL/RLS: no ejecutadas.
- Migraciones aplicadas: ninguna por esta auditoría.
- Cambios de datos: ninguno.
- Despliegues: ninguno.


## 8. Inventario efectivo del proyecto Supabase conectado — 2026-11-03

Se consultó el catálogo de PostgreSQL mediante consultas de solo lectura al proyecto conectado. Este inventario reemplaza como evidencia actual la nota anterior que indicaba que no se disponía de salida SQL del proyecto.

### `public.erp_state`

- RLS habilitado; `FORCE ROW LEVEL SECURITY` deshabilitado; propietario `postgres`.
- Columnas observadas: `user_id uuid NOT NULL`, `state jsonb NOT NULL`, `updated_at timestamptz NOT NULL`.
- Tres políticas efectivas, todas PERMISSIVE y dirigidas a `authenticated`: SELECT propio; INSERT propio; UPDATE propio.
- SELECT y UPDATE exigen `auth.uid() = user_id`; UPDATE también conserva el mismo `user_id` mediante `WITH CHECK`.
- INSERT y UPDATE exigen rol general entre Administrador, Supervisor, Ventas, Compras y Finanzas.
- SELECT/INSERT/UPDATE usan `COALESCE(farmi_active::boolean, true)`; claim ausente se interpreta como activo.
- No se observó policy DELETE.
- Grants efectivos para `authenticated`: SELECT, INSERT y UPDATE. No se observó DELETE para roles de cliente.
- El JSONB no se valida por módulo: el permiso de rol general habilita escritura de toda la fila.

### `public.store_products`

- RLS habilitado; `FORCE ROW LEVEL SECURITY` deshabilitado; propietario `postgres`.
- Política observada: SELECT público solo cuando `is_published = true`.
- No se observaron políticas INSERT, UPDATE o DELETE para `anon` ni `authenticated`.
- Sin embargo, `anon` y `authenticated` tienen grants SQL de SELECT, INSERT, UPDATE y DELETE. En el estado actual, la falta de políticas de escritura hace que RLS bloquee las escrituras de esos roles; los grants DML son innecesarios y amplían el riesgo de cambios futuros si alguien añade una policy permisiva.
- Recomendación para un cambio futuro revisado: conservar SELECT y revocar INSERT/UPDATE/DELETE a `anon` y `authenticated`, dejando escrituras únicamente a una ruta administrativa de servidor autenticada. No se modificaron grants.

### Catálogo de objetos y roles

- No se encontraron funciones en esquema `public` en la consulta al catálogo; tampoco funciones `SECURITY DEFINER` públicas.
- No se encontraron triggers asociados a `erp_state` o `store_products`.
- No se encontraron vistas en esquema `public`.
- Roles: `anon` y `authenticated` no tienen `BYPASSRLS`; `service_role` sí tiene `BYPASSRLS` (comportamiento esperado para la clave de servidor); `postgres` también tiene `BYPASSRLS` y es propietario de ambas tablas.
- No se intentaron escrituras, pruebas de explotación ni cambios de configuración.

### Conclusión actualizada

El riesgo principal confirmado sigue siendo la autorización por módulo ausente en `erp_state` y el valor por defecto permisivo de `farmi_active`. Se añade un hallazgo de privilegio excesivo latente en `store_products`: grants DML de cliente sin policies DML. No equivale a una escritura pública actualmente permitida, pero conviene reducir esos grants en una ventana de cambio separada y después de verificar la ruta de administración de catálogo.
