# Auditoría en vivo de Supabase — FARMI
Fecha: 2026-11-03
Proyecto inspeccionado: `difarmas-erp`
Alcance: consultas de solo lectura; no se modificaron tablas, políticas, datos, funciones ni configuración del proyecto.

## Hallazgos confirmados en el proyecto conectado

1. `public.erp_state` existe, tiene RLS habilitado y tres filas. La clave primaria es `user_id`, referenciada a `auth.users.id`. El snapshot es JSONB y tiene una restricción de objeto JSON.
2. Las políticas activas son `erp_state_select_own`, `erp_state_insert_own` y `erp_state_update_own`. Las escrituras verifican propietario y rol, pero no validan `app_metadata.farmi_permissions` ni las claves modificadas del snapshot. No existe política DELETE.
3. Las políticas actuales interpretan la ausencia de `farmi_active` como activa mediante `coalesce(..., true)`. El inventario de las tres cuentas existentes mostró el claim activo explícitamente como true; la migración versionada se endureció para fallar cerrado cuando falte el claim.
4. La consulta de cuentas solo devolvió roles Administrador y Ventas; todas las cuentas inventariadas tenían estado activo explícito y arrays de permisos. No se almacenaron correos ni datos personales en este informe.
5. `public.store_products` también tiene RLS habilitado. Solo existe política SELECT para productos publicados. Aunque anon y authenticated tienen GRANT de escritura, no hay políticas RLS que permitan INSERT/UPDATE/DELETE, por lo que esas operaciones quedan bloqueadas por RLS. No se revocaron privilegios porque esa tabla también sirve a la tienda y debe verificarse primero su flujo administrativo.
6. La función `public.resolve_supplier_credit_note(bigint)` no existe en la base conectada, aunque el cliente del ERP la invoca mediante RPC y el repositorio contiene una migración para crearla. La operación de nota de crédito no está disponible hasta aplicar una migración revisada.
7. El historial de migraciones devuelto por Supabase está vacío. Por tanto, no se puede asumir que las migraciones versionadas en GitHub estén aplicadas o que exista una cadena de migración sincronizada.
8. El asesor de seguridad de Supabase informa que la protección contra contraseñas filtradas está deshabilitada.
9. El asesor de rendimiento detectó tres políticas de `erp_state` que reevaluaban funciones Auth por fila. La migración versionada se ajustó usando subconsultas para las funciones Auth.

## Cambios preparados en esta rama

- `202611020001_erp_state_role_write_guard.sql`: ahora exige `farmi_active=true` explícito y optimiza las lecturas de claims. Conserva el aislamiento por propietario, el filtro de roles y la ausencia de DELETE.
- `202611020002_supplier_credit_note_atomic.sql`: ahora declara la RPC como SECURITY INVOKER, valida permisos confiables de módulos (`proveedores`, `compras`, `cuentas_pagar` o `finanzas`) y falla cerrado ante claims ausentes. Conserva el bloqueo de fila y la transición idempotente.
- Ninguna de estas migraciones fue aplicada a Supabase durante esta auditoría.

## Pendientes que requieren diseño y pruebas adicionales

1. El snapshot monolítico no permite aislar con seguridad cobros, pagos, inventario, cuentas por cobrar/pagar y configuración solo comparando claves JSON. Se necesitan RPCs de negocio o tablas normalizadas con transacciones y RLS por operación.
2. La inicialización INSERT debe distinguir una cuenta nueva de una importación de datos locales. No debe permitirse que el navegador inserte libremente un snapshot arbitrario ni descartarse datos locales.
3. El endpoint de administración de usuarios comprueba la última cuenta administradora leyendo la lista y luego actualizando Auth; la secuencia no es atómica y puede tener una condición de carrera con solicitudes simultáneas. La solución robusta requiere coordinación transaccional en servidor/base de datos.
4. La invitación crea primero el usuario y luego asigna `app_metadata`; el código devuelve un error explícito si falla la segunda operación, pero la cuenta invitada ya existe y necesita revisión administrativa.
5. Debe habilitarse la protección de contraseñas filtradas en Supabase Auth desde la configuración del proyecto.
6. Antes de revocar GRANT de escritura en `store_products`, inspeccionar la tienda y su panel administrativo para evitar romper la gestión legítima del catálogo.

## Verificación requerida antes de cerrar

- Aplicar primero las migraciones revisadas en un entorno de prueba aislado.
- Probar RLS con usuarios de prueba por rol, permisos faltantes, cuenta inactiva, propietario incorrecto, claves desconocidas y concurrencia.
- Probar la RPC con permisos permitidos/denegados, devolución ya procesada, compra no vinculada y dos llamadas concurrentes.
- Ejecutar pruebas del repositorio y build de producción de Preview.
- Aplicar a la base conectada solo tras autorización expresa y respaldo verificado.

**Conclusión:** se confirmó acceso a la base real y se detectó que la RPC de nota de crédito no está instalada. Los cambios SQL están preparados en la rama de auditoría, no desplegados en la base. La autorización por módulo y la inicialización segura siguen sin resolverse por la arquitectura JSONB monolítica.
