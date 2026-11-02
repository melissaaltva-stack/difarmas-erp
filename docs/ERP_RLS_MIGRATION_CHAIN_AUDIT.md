# FARMI / DIFARMAS ERP — auditoría de la cadena de migraciones RLS

**Tipo:** inspección estática de las migraciones SQL presentes en la rama `security/erp-state-permission-matrix`.  
**Archivos revisados:**
- `supabase/migrations/202610170001_erp_state.sql`
- `supabase/migrations/202611020001_erp_state_role_write_guard.sql`

**Estado:** no ejecutado contra Supabase. No se modificó ninguna migración ni dato.

## 1. Cómo se compone la protección

La primera migración:

- Crea `public.erp_state` con `user_id` como PK y FK a `auth.users(id)`.
- Habilita RLS.
- Revoca privilegios de tabla a `anon` y `authenticated`, y después concede SELECT/INSERT/UPDATE a `authenticated`.
- Crea policies de propietario para SELECT, INSERT y UPDATE.
- No crea policy DELETE.

La segunda migración reemplaza esas tres policies por otras que también validan estado y rol desde `app_metadata`. No modifica los GRANT de la primera migración; ambos archivos se aplican en orden y su efecto es acumulativo.

## 2. Hallazgos

### MIG-01 — La comprobación booleana puede fallar con metadata malformada
**Severidad: media.**

La expresión `(auth.jwt() -> 'app_metadata' ->> 'farmi_active')::boolean` convierte texto arbitrario a booleano. Si el claim contiene un valor no convertible, la evaluación de la policy puede generar un error SQL en lugar de una denegación limpia.

**Recomendación:** validar el claim sin conversiones inseguras, por ejemplo comparando explícitamente el texto con `'true'` y definiendo el tratamiento de ausencia/valores inválidos. La decisión entre compatibilidad y fail-closed debe hacerse después de inventariar cuentas reales.

### MIG-02 — La migración inicial concede UPDATE de toda la fila a authenticated
**Severidad: alta como limitación de granularidad; no es por sí sola una omisión de RLS.**

El GRANT de UPDATE se concede a nivel de tabla. RLS restringe filas, pero no qué claves JSONB puede cambiar cada usuario. La segunda migración agrega rol general, no permisos por módulo ni comparación de columnas/claves.

**Impacto:** un rol de escritura que pueda actualizar su fila puede intentar reemplazar el snapshot completo. Esto coincide con el riesgo documentado en `ERP_WRITE_PATHS_SECURITY_FINDINGS.md`.

**Recomendación:** no tratar esta policy como separación de módulos. La protección por operación requiere RPCs específicas y/o tablas normalizadas con RLS.

### MIG-03 — RLS no está forzado para el propietario de la tabla
**Severidad: informativa; requiere verificar el propietario real.**

Las migraciones usan `ENABLE ROW LEVEL SECURITY`, pero no `FORCE ROW LEVEL SECURITY`. Los propietarios de tablas normalmente pueden omitir RLS, salvo configuración adicional; roles con `BYPASSRLS` y superusuarios también pueden omitirla.

**Recomendación:** inventariar propietario, privilegios y `rolbypassrls` en staging. No activar `FORCE ROW LEVEL SECURITY` sin comprobar qué funciones, procesos de mantenimiento y operaciones administrativas dependen del comportamiento actual.

### MIG-04 — La FK elimina el snapshot al eliminar un usuario Auth
**Severidad: media; decisión de retención.**

La columna `user_id` usa `ON DELETE CASCADE`. El borrado definitivo de un usuario Auth elimina también su snapshot. Puede ser intencional, pero debe conocerse antes de habilitar eliminación de usuarios desde el panel.

**Recomendación:** confirmar la política de retención y el procedimiento de baja. Si se requiere conservar información, exportar/archivar de forma controlada antes de borrar el usuario; no cambiar la FK sin plan de migración.

### MIG-05 — Las policies son permisivas por defecto
**Severidad: informativa, con verificación pendiente en DB.**

Las policies creadas no especifican `AS RESTRICTIVE`, por lo que son permisivas. PostgreSQL combina policies permisivas aplicables mediante OR. Las migraciones eliminan policies con tres nombres conocidos, pero no prueban que la base real no tenga otras policies permisivas para la misma tabla.

**Recomendación:** ejecutar el inventario de `pg_policies` en staging y revisar todas las policies de `erp_state`, no solo las tres esperadas.

## 3. Resultado por operación

| Operación | Resultado según migraciones del repositorio |
|---|---|
| SELECT | Propietario y cuenta activa según claim; falta verificar policies adicionales en DB |
| INSERT | Propietario, cuenta activa y rol de escritura permitido |
| UPDATE | Propietario, cuenta activa y rol de escritura permitido |
| DELETE | No hay policy DELETE en estas migraciones |
| Separación por módulo | No implementada |
| Restricción por elemento JSONB | No implementada |
| Protección frente a owner/BYPASSRLS | Depende de propietario y rol real; no verificado |

## 4. Orden recomendado antes de cualquier cambio

1. Ejecutar `supabase/tests/erp_state_security_inventory.sql` en staging.
2. Comparar las policies reales con las dos migraciones y detectar policies adicionales.
3. Revisar propietario de `erp_state`, grants efectivos y roles con `BYPASSRLS`.
4. Revisar si existen usuarios Auth que se eliminan desde el panel y confirmar retención de snapshots.
5. Diseñar una validación segura de `farmi_active` con una migración de compatibilidad.
6. Mantener la separación de módulos fuera del snapshot: implementarla mediante operaciones de servidor autorizadas.

## 5. Límites

Este informe describe únicamente el SQL versionado en la rama revisada. No confirma qué migraciones están aplicadas en el proyecto Supabase, ni si hay policies, grants, triggers, propietarios o funciones adicionales creadas fuera del repositorio. No ejecutar cambios en producción con base únicamente en esta revisión.
