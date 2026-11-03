# FARMI / DIFARMAS ERP — hallazgos de rutas de escritura y control de acceso

**Tipo:** revisión estática de código en rama aislada.  
**Estado:** hallazgos verificados en archivos del repositorio; no se ejecutaron pruebas ni llamadas a Supabase.  
**Rama:** `security/erp-state-permission-matrix`.

## Resumen ejecutivo

La autorización visible en la interfaz se aplica principalmente al menú y a la renderización del módulo. El guardado remoto, en cambio, persiste un snapshot JSONB completo por usuario. En el código revisado no se encontró una comprobación central de `farmi_permissions` antes de cada mutación del estado ni una autorización por clave del snapshot en el servicio de persistencia.

Esto significa que la ocultación de módulos no debe considerarse una barrera de seguridad para los datos. La barrera real depende de las políticas RLS y de que el usuario solo pueda modificar su propia fila; esa separación por propietario no equivale a separación por módulo.

## Hallazgos

### WRITE-01 — Autosave de snapshot completo sin autorización por módulo
**Severidad: alta.**

En `src/hooks/useErpState.ts` se construye un `snapshot` con colecciones operativas, financieras, de usuarios/configuración e inventario. Un efecto programa `saveErpSnapshot(userId, snapshot)` cuando cambia el estado. El servicio `src/services/remoteErpState.ts` actualiza `erp_state.state` completo mediante `.update({ state: snapshot, updated_at })`.

El servicio recibe `userId` y snapshot, pero no recibe ni verifica permisos por módulo. La policy RLS conocida limita al propietario/rol general, no compara las claves JSONB modificadas.

**Impacto:** un usuario con permiso general de escritura sobre su fila podría alterar claves que no corresponden a sus módulos, si puede provocar o enviar una actualización equivalente por cliente/API. Ocultar el módulo en React no impide una petición directa.

**Recomendación:** no conectar el snapshot completo a nuevos controles de permisos como si fueran autorización. Migrar las escrituras sensibles a RPCs/servicios de servidor con autorización por operación y validación de estado; normalizar tablas sensibles gradualmente.

### WRITE-02 — Mutaciones de datos se exponen como setters y funciones del cliente
**Severidad: alta.**

En `src/App.tsx` se pasan setters directos a componentes, incluidos `setReceivables`, `setPayables`, `setPaymentTransactions`, `setMissingProductRequests`, `setExpenses`, `setSettings`, `setCustomers` y `setSuppliers`. El hook contiene además operaciones cliente como `saveProduct`, `deleteProduct`, `recordSale`, `receivePurchase`, `recordSaleAdjustment` y `resolveSupplierReturn`.

Estas funciones organizan la UI y la lógica del navegador, pero no son una frontera de seguridad frente a un cliente modificado o una petición directa.

**Recomendación:** sustituir setters de colecciones sensibles por comandos de dominio validados en servidor. Mantener setters locales solo como estado de presentación, sin concederles autoridad sobre persistencia.

### WRITE-03 — Autorización de módulo es principalmente navegación/renderizado
**Severidad: alta.**

En `src/App.tsx`, `canSee` consulta los permisos del JWT y `activeAllowed` decide si se renderiza el módulo activo. Los submenús filtran algunas opciones. No obstante, el componente raíz sigue pasando a módulos los datos y callbacks del hook, y el autosave opera independientemente de qué módulo está visible.

**Impacto:** un usuario puede no ver una pantalla y aun así la sesión cliente mantiene referencias a datos/setters; la UI no impide por sí sola que se invoquen funciones o se construya una petición alternativa.

**Recomendación:** mantener la UI como experiencia de usuario, no como control de autorización. Cada operación debe volver a validar rol, permiso específico, propiedad y reglas de negocio en el servidor/DB.

### WRITE-04 — Ausencia de rol produce permisos de fallback en la interfaz
**Severidad: media-alta; requiere decisión de compatibilidad.**

En `src/App.tsx`, cuando no se obtiene un rol válido, se usa `['dashboard','configuracion']` como permisos de interfaz. Además, `active` se calcula con `userAppMetadata.farmi_active !== false`, de modo que la ausencia del claim se interpreta como activo. En contraste, `api/admin-users.ts` exige `farmi_active === true` para reconocer administradores y la migración RLS preparada usa `coalesce(..., false)`, por lo que falla cerrada. Esta diferencia entre interfaz, API y RLS debe corregirse antes de activar la migración.

**Impacto:** metadata incompleta no falla cerrada de forma consistente. El fallback visual no concede por sí mismo acceso a Supabase, pero crea una discrepancia que puede confundir y debe alinearse con la política real.

**Recomendación:** inventariar usuarios/claims existentes antes de cambiar el comportamiento. Después, definir una migración explícita para estados incompletos, bloquear acceso hasta corregir metadata y probar sesiones antiguas.

### WRITE-05 — Borrado físico de productos
**Severidad: media-alta.**

En `src/hooks/useErpState.ts`, `deleteProduct(id)` elimina el producto del arreglo `products`. Como ventas, compras y movimientos históricos guardan referencias/campos derivados del producto, el borrado puede debilitar la trazabilidad o romper relaciones de UI.

**Recomendación:** implementar archivado/inactivación, preservar el identificador y los datos históricos, y evitar borrado físico salvo proceso administrativo con validación de dependencias.

### WRITE-06 — Finanzas y cuentas por cobrar/pagar comparten mutaciones del snapshot
**Severidad: alta.**

Los componentes de Finanzas, Cuentas por cobrar y Cuentas por pagar reciben setters para colecciones completas. El estado compartido incluye `receivables`, `payables`, `paymentTransactions`, `cashMovements`, `cashClosures` y `expenses`. El historial de cobros y pagos también se guarda dentro del mismo snapshot.

**Impacto:** un permiso de UI o policy que autorice una clave completa no separa operaciones como registrar un cobro, editar un saldo, alterar un pago a proveedor o reescribir el historial.

**Recomendación:** operaciones RPC separadas para cobrar, pagar, revertir, ajustar y cerrar caja; idempotencia, bloqueos transaccionales y movimientos inmutables. No dar UPDATE directo sobre colecciones completas.

## Flujo de persistencia revisado

1. El hook mantiene cada colección en estado React y también guarda copias locales.
2. Construye un único objeto `ErpSnapshot` con todas las colecciones.
3. Tras los cambios, el autosave invoca `saveErpSnapshot(userId, snapshot)`.
4. El servicio usa INSERT inicial si no existe revisión remota; en caso contrario hace UPDATE de la columna JSONB completa con control optimista por `updated_at`.
5. Existe una ruta especial para cotizaciones que lee la última revisión y actualiza la clave `quotes`, pero no constituye una autorización de módulo.

El control de revisión reduce algunas colisiones; no valida quién puede cambiar cada dato ni garantiza integridad de negocio.

## Archivos revisados

- `src/hooks/useErpState.ts`
- `src/services/remoteErpState.ts`
- `src/App.tsx`
- `api/admin-users.ts`

## Acciones recomendadas, ordenadas por seguridad

1. **No desplegar esta rama como endurecimiento de permisos todavía.** La documentación y helpers no sustituyen autorización en backend.
2. Obtener y revisar el inventario real de políticas, grants, funciones, triggers y vistas en staging.
3. Definir una matriz operación → rol/permisos → tablas/filas afectadas.
4. Implementar primero RPCs transaccionales para cobros/pagos, ventas y recepción de compras.
5. Separar catálogo/precios, lotes/stock, movimientos e historial de costos.
6. Sustituir setters de colecciones financieras por comandos de dominio.
7. Introducir archivado de productos y conservar las referencias históricas.
8. Migrar datos existentes con copia, validación, reconciliación y plan de reversión.

**Límites:** este informe es una inspección estática de la rama indicada. No demuestra explotación, no confirma el estado de Supabase y no reemplaza pruebas con JWT de usuarios ficticios en staging.

### WRITE-07 — Estado activo interpretado de forma distinta en interfaz y servidor
**Severidad: media-alta.**

En `src/App.tsx`, `tokenAccess` asigna `active: userAppMetadata.farmi_active !== false`; si el claim no existe, la interfaz lo trata como activo. En `api/admin-users.ts`, `isAdmin` exige `farmi_active === true`, y la migración RLS preparada exige explícitamente el claim verdadero mediante `coalesce(..., false)`.

**Impacto:** una cuenta con metadata incompleta puede ver módulos según sus permisos de interfaz aunque la API administrativa y la base de datos la rechacen. La interfaz no es la autoridad, pero la discrepancia causa comportamiento confuso y puede ocultar problemas de aprovisionamiento.

**Recomendación:** alinear la lectura de estado en la interfaz con el criterio estricto del servidor (`farmi_active === true`) y probar sesiones con claim ausente, falso y verdadero. No aplicar cambios de RLS hasta completar pruebas con usuarios de staging.

### WRITE-08 — El primer guardado depende de una inserción inicial del cliente
**Severidad: media; requiere validar el aprovisionamiento de cuentas nuevas.**

En `src/services/remoteErpState.ts`, cuando no existe `lastSeenRevision`, `saveErpSnapshotNow` ejecuta un `INSERT` de la fila completa desde el navegador. El flujo evita correctamente un `UPSERT` que podría sobrescribir una fila creada concurrentemente, pero la política de INSERT solo comprueba propietario, estado activo y rol general; no comprueba permisos de módulo ni valida el contenido del snapshot.

**Impacto:** cualquier rol al que RLS permita INSERT puede inicializar todas las claves del snapshot, no solo las asociadas a sus módulos. Esto es otra manifestación del problema monolítico y no debe confundirse con una operación de inicialización segura por dominio.

**Recomendación:** mover el aprovisionamiento inicial a una operación controlada que valide identidad, rol y esquema permitido; conservar la semántica insert-only y la protección ante carreras.

### WRITE-09 — La actualización de cotizaciones omite la autorización de módulo
**Severidad: alta.**

`saveQuotesForUserNow` lee el snapshot actual y actualiza únicamente la clave `quotes`, con control optimista de revisión y reintentos. Sin embargo, no verifica que el JWT tenga el permiso `cotizaciones`; la policy RLS preparada autoriza por rol general y propietario, no por módulo.

**Impacto:** la operación evita pisar otras claves, pero un usuario con escritura general puede modificar cotizaciones aunque no tenga el permiso específico de ese módulo.

**Recomendación:** exigir el permiso `cotizaciones` en una RPC de servidor y validar el contenido de la cotización antes de escribir. No confiar en el filtrado del menú.

## Revisión complementaria — 2026-11-03

Se revisaron nuevamente `src/services/remoteErpState.ts`, `src/hooks/useErpState.ts`, `src/App.tsx`, `src/components/Settings.tsx` y la migración RLS preparada. Se confirmó que:
- El autosave sustituye el objeto `state` completo; la revisión `updated_at` evita algunas sobrescrituras concurrentes, pero no valida permisos ni reglas de negocio.
- `saveQuotesForUserNow` actualiza solo `quotes`, pero tampoco valida el permiso de módulo.
- `Settings` permite modificar usuarios locales en `settings.users` y persiste la configuración en el snapshot; el control administrativo real de cuentas usa además `/api/admin-users`. No debe confundirse la lista local de usuarios con la metadata de autenticación.
- `deleteProduct` realiza borrado físico del arreglo de productos; el archivado es preferible para preservar trazabilidad.

**Alcance:** revisión estática. No se modificó código de ejecución ni se hicieron escrituras en Supabase.

## Actualización posterior — 2026-11-03 (commit 66e24fb3)

**WRITE-07: corrección aplicada en la interfaz.** En `src/App.tsx`, el estado activo ahora solo es verdadero cuando `userAppMetadata.farmi_active === true`; además, el renderizado de módulos exige `userAccess?.active === true`. Esto elimina el valor por defecto permisivo cuando falta el claim. La corrección alinea la interfaz con el criterio estricto ya usado por la API administrativa y por la migración RLS preparada.

**Verificación:** el commit `66e24fb3acd48379e33ce459c7f0d9a3b40566c6` completó `npm run build` y `npm test` con resultado SUCCESS en GitHub Actions. El Preview Vercel correspondiente quedó en estado `READY`. No se promovió a producción.

**Compatibilidad pendiente:** antes de aplicar cambios RLS o habilitar el endurecimiento en producción, debe verificarse que cada cuenta legítima tenga `farmi_active: true` en Auth metadata. Las cuentas con claim ausente o falso quedarán bloqueadas en la interfaz hasta su aprovisionamiento correcto. No se modificó metadata de usuarios.

**WRITE-09 permanece abierto:** `saveQuotesForUserNow` todavía permite actualizar la clave `quotes` sin validar el permiso `cotizaciones` en servidor. No se añadió una comprobación cliente como sustituto de autorización. La corrección requiere RPC/operación de servidor y pruebas en staging.

**Alcance de esta actualización:** se corrigió el criterio de acceso visual y se verificó build/tests/Preview. No se aplicaron migraciones, no se escribieron datos en Supabase y no se modificó producción.


## Verificación de base activa — 2026-11-03

Se ejecutaron consultas SQL de solo lectura en el proyecto Supabase vinculado. La inspección confirma:

- `public.erp_state` tiene RLS habilitado y no forzado; propietario: `postgres`.
- Solo aparecen las tres políticas esperadas para `erp_state` (SELECT, INSERT y UPDATE); todas son PERMISSIVE.
- Las expresiones actuales de SELECT/INSERT/UPDATE siguen usando `COALESCE((app_metadata.farmi_active)::boolean, true)`. Por tanto, la base activa todavía permite que un claim ausente satisfaga la condición de estado activo.
- INSERT y UPDATE exigen uno de los roles generales Administrador, Supervisor, Ventas, Compras o Finanzas; no verifican `farmi_permissions` ni la clave JSONB que se modifica.
- La migración `202611020001_erp_state_role_write_guard.sql` de la rama usa el criterio estricto (`COALESCE(..., false)`), pero no está aplicada en la base consultada.
- `store_products` también tiene RLS habilitado. La policy observada para `anon` y `authenticated` es únicamente SELECT de productos publicados; aunque existen grants de escritura declarados para esos roles, no se observó una policy INSERT/UPDATE/DELETE que los autorice. No se intentó ninguna escritura.

**Riesgo confirmado:** la condición permisiva de estado activo en `erp_state` está presente en la base activa y no es solo una posibilidad inferida del repositorio. WRITE-01/WRITE-09 continúan abiertos porque la autorización por módulo requiere una frontera de servidor/DB, no un filtro de interfaz.

**Alcance:** únicamente consultas SELECT al catálogo del sistema. No se modificaron filas, policies, grants, funciones, usuarios, migraciones ni configuración de Supabase. La revisión no incluyó pruebas de escritura con JWT ni validación de restauración.
