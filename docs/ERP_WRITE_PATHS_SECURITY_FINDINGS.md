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


## Revisión de RPC y autorización efectiva — 2026-11-03

### RPC-01 — La nota de crédito de proveedor acepta permisos más amplios que la interfaz

**Severidad: alta si la migración está aplicada; estado de aplicación no verificado.**

La migración `supabase/migrations/202611020002_supplier_credit_note_atomic.sql` define `resolve_supplier_credit_note(bigint)` como `SECURITY INVOKER`, concede EXECUTE a `authenticated` y valida identidad, cuenta activa, rol y metadata firmada. Sin embargo, su predicado de permisos acepta cualquiera de estos módulos: `proveedores`, `compras`, `cuentas_pagar` o `finanzas`.

En contraste, `src/App.tsx` pasa `canManageSupplierReturns={canSee('compras')}` a Compras/Proveedores. Por tanto, la interfaz solo habilita la gestión de devoluciones para quien tiene `compras`, mientras que la RPC permite ejecutar la resolución de una nota de crédito a usuarios con cualquiera de los otros tres permisos si pueden invocarla directamente.

La operación actualiza en una transacción las claves `supplierReturns`, `payables` y `supplierCredits`. La condición amplia puede permitir a un usuario con solo `proveedores`, `cuentas_pagar` o `finanzas` cambiar el estado de una devolución y aplicar el crédito, aunque la interfaz no le conceda esa acción.

**Recomendación:** definir con el negocio qué permisos deben poder resolver notas de crédito. Alinear el predicado SQL y la interfaz con esa misma regla; no basta con ocultar el botón. Añadir pruebas negativas para cada permiso aislado y pruebas positivas para las combinaciones autorizadas. No aplicar esta migración ni modificar Supabase durante esta auditoría.

**Límite de verificación:** se inspeccionó el archivo SQL de la rama y el punto de llamada en el cliente. No se confirmó que la función exista o esté actualizada en la base activa, ni se hicieron invocaciones de prueba.


## Revalidación de RPC y base activa — 2026-11-03 (cierre de RPC-01)

La consulta de solo lectura al catálogo `pg_proc` del proyecto Supabase activo no encontró ninguna función `public.resolve_supplier_credit_note(bigint)`. La consulta de historial de migraciones también devolvió una lista vacía. Por tanto, **RPC-01 no es una función activa vulnerable en la base consultada**: el hallazgo previo aplicaba únicamente al SQL preparado en la rama y su estado de despliegue no estaba confirmado.

Se corrigió el archivo `supabase/migrations/202611020002_supplier_credit_note_atomic.sql` para exigir el permiso `compras`, que coincide con `canManageSupplierReturns={canSee('compras')}` en `src/App.tsx`. Los permisos `proveedores`, `cuentas_pagar` o `finanzas` por sí solos ya no satisfacen el control de la futura RPC.

**Estado:** corregido en código/migración de la rama; no aplicado a Supabase. La base activa no contiene la función, así que la resolución atómica de notas de crédito tampoco está disponible allí mediante esta RPC. No se debe considerar habilitada hasta que se apruebe y aplique la migración en un proceso separado y se prueben los permisos con cuentas de prueba.

## Aviso del asesor de seguridad de Supabase

La consulta de asesores de seguridad devolvió un aviso: **Leaked Password Protection Disabled**. La protección contra contraseñas comprometidas está deshabilitada en Auth. No se cambió la configuración de Auth, conforme al alcance de esta auditoría. Requiere que el administrador valore habilitarla desde la configuración de autenticación y verificar el comportamiento de registro/cambio de contraseña.

## Límites que siguen abiertos y no pueden cerrarse solo con cambios de interfaz

- **WRITE-01 / PLATFORM-02:** el snapshot `erp_state` sigue siendo un JSON completo por usuario; las políticas activas no aplican permisos por módulo o por clave. Un usuario autorizado a actualizar su fila puede intentar alterar claves ajenas a su módulo.
- **WRITE-09:** el guardado de cotizaciones sigue necesitando autorización de servidor para `cotizaciones`.
- **CASH-01 a CASH-05:** cierres, caja, pagos, ventas, ajustes y recepción de compras necesitan operaciones transaccionales, validación del lado servidor e idempotencia.
- **ADMIN-03 / ADMIN-07 / ADMIN-15:** bootstrap y protección del último administrador requieren serialización transaccional.
- **ADMIN-16:** limitación persistente de intentos del bootstrap requiere almacenamiento compartido; no se sustituyó por un límite en memoria.
- **SESSION-02 / LOCAL-01 a LOCAL-03:** los datos locales gerenciales y el historial no son auditoría inmutable ni están completamente separados por usuario; cualquier migración/borrado necesita plan de respaldo y recuperación.
- **PLATFORM-03 / PLATFORM-04:** faltan verificaciones HTTP del dominio de producción para confirmar cabeceras de seguridad; el Preview de rama no sustituye esa comprobación.
- **AUTH-01:** protección de contraseñas comprometidas deshabilitada según asesor de Supabase.

Estos puntos permanecen abiertos porque cerrarlos exige cambios de backend/DB, decisiones de permisos, configuración Auth o pruebas de operación controladas. No se han realizado esas acciones en este trabajo.

**Alcance de verificación:** CI y Preview se verificaron para el commit anterior `6b187a2b1d5dd3d762da89198787f4ead91c05ba`; el nuevo commit que contiene el ajuste SQL requiere su propia CI y Preview. No se modificó `main`, no se aplicaron migraciones, no se escribieron datos ni se alteraron usuarios, políticas, grants o configuración de Supabase.


## Revisión ampliada de escrituras financieras y operativas — 2026-11-03

### CASH-06 — Cobros y pagos modifican saldos e historial desde el cliente

**Severidad: alta por integridad financiera; requiere backend.**

Revisión de `src/components/Finance.tsx` y `src/components/FinancialModules.tsx`:
- `collect` incrementa `receivables[].paid` y añade una fila `paymentTransactions` en dos actualizaciones de estado cliente.
- `paySupplier` / `pay` hacen lo mismo con `payables[].paid` y el historial de pagos.
- Los importes, el método de pago, las fechas y el ID de transacción se originan en el navegador.
- Los bloqueos `useRef(Set)` evitan algunos dobles clics en esa instancia, pero no son una garantía entre pestañas, dispositivos o solicitudes manipuladas.
- El saldo y el historial se guardan dentro del snapshot `erp_state`; no existe en el flujo revisado una operación servidor dedicada que valide saldo, permiso funcional, idempotencia y registro contable en una transacción.

**Impacto:** un cliente que tenga permiso general de UPDATE sobre su fila puede intentar alterar saldos o historial en el JSONB sin pasar por el flujo visual de cobro/pago. Una modificación parcial o concurrente puede dejar importes y transacciones inconsistentes.

**Corrección necesaria:** RPC/endpoint transaccional por operación, que derive la identidad del JWT, compruebe `cuentas_cobrar` o `cuentas_pagar`, valide el saldo vigente bajo bloqueo, acepte una clave de idempotencia única y actualice saldo e historial en la misma transacción. El navegador debe mostrar éxito solo tras confirmación del servidor.

### CASH-07 — Gastos, movimientos de caja y cierres son mutaciones locales del snapshot

**Severidad: alta por integridad y trazabilidad; requiere backend.**

En `Finance.tsx`, `addExpense`, el registro de movimientos de caja y `closeCash` llaman directamente a `setExpenses`, `setMovements` y `setClosures`. El cierre diario usa `closingRef` y comprueba cierres existentes en el estado descargado, pero no hay restricción única ni serialización compartida entre dispositivos.

**Impacto:** los controles de duplicado y cierre diario son locales a la instancia. No impiden que dos dispositivos registren cierres para la misma fecha o que un cliente altere gastos/movimientos del snapshot sin una autorización específica de servidor.

**Corrección necesaria:** operaciones servidor separadas para registrar gasto, movimiento y cierre; autorización `finanzas`, idempotencia y restricción única por usuario/fecha de cierre, con cálculo de caja basado en movimientos persistidos y validados.

### WRITE-10 — Las operaciones principales no tienen una frontera de escritura servidor

La revisión de `src/App.tsx`, `src/hooks/useErpState.ts`, `src/services/remoteErpState.ts` y los módulos POS, Compras, Inventario y Finanzas confirma que:
- POS llama `recordSale` y `recordSaleAdjustment` en el hook; ambos modifican colecciones de snapshot desde el cliente.
- Compras llama `receivePurchase`; inventario usa `saveProduct` y `deleteProduct`; devoluciones usan `recordSupplierDispatch` y `resolveSupplierReturn`.
- Cuentas por cobrar/pagar, gastos, caja y cierres actualizan setters locales.
- La única RPC operativa identificada para nota de crédito no está instalada en la base activa.
- Las rutas API del repositorio no proporcionan endpoints transaccionales para ventas, compras, inventario o finanzas; `api/admin-users.ts` gestiona cuentas y `api/store-catalog.ts` es lectura pública del catálogo.

La interfaz restringe navegación mediante `canSee` y `activeAllowed`, pero estas comprobaciones no se ejecutan en PostgreSQL ni dentro de una operación de escritura servidor. En combinación con las policies activas de `erp_state`, un usuario con rol general autorizado puede modificar el JSONB de módulos que no tiene asignados.

**Conclusión:** no se considera suficiente añadir más comprobaciones de interfaz. Debe diseñarse una frontera de comandos servidor con autorización por módulo y transacciones; luego restringir la escritura directa del snapshot para roles funcionales, manteniendo una ruta de aprovisionamiento/migración controlada. No se aplicó ninguna modificación a la base.

### Estado de las comprobaciones

- Revisión estática de las rutas y componentes citados: completada.
- Pruebas de abuso con JWT o escrituras reales: no ejecutadas, por la restricción de no alterar Supabase.
- Cambios de ejecución: ninguno.
- Cambios de Supabase/Auth/datos: ninguno.


## Revisión adicional de rutas API y autenticación — 2026-11-03

### API-03 — Estado de bootstrap disponible para cualquier sesión autenticada

**Severidad: baja / informativa; no se confirma escalada de privilegios.**

La ruta `api/admin-users.ts` valida el bearer token con `auth.getUser(accessToken)`. La acción `status` no exige que `farmi_active === true` ni que el usuario sea administrador; devuelve el estado de administrador del propio usuario, si el bootstrap está disponible y el correo de la propia cuenta. La acción `bootstrap` sí exige el secreto de activación comparado en tiempo constante y comprueba que no exista ya un administrador. Todas las demás acciones requieren `farmi_active === true` y rol Administrador.

**Conclusión:** no se encontró una vía directa para administrar usuarios usando únicamente la acción `status`. Se recomienda limitar la respuesta de estado a los campos estrictamente necesarios para el flujo de inicio y mantener la validación estricta de las demás acciones. El control anti-fuerza-bruta persistente del bootstrap sigue abierto como ADMIN-16.

### API-04 — Controles positivos observados en las rutas existentes

La revisión de `api/admin-users.ts`, `api/store-catalog.ts`, `src/components/AuthGate.tsx` y `src/services/supabaseClient.ts` confirma:
- Las operaciones administrativas requieren método POST y token Bearer validado por Supabase Auth.
- Las acciones de gestión exigen claim activo explícito y rol Administrador.
- La respuesta administrativa usa `Cache-Control: no-store` y `Vary: Authorization`.
- La URL de redirección de invitación procede de configuración del servidor y no del encabezado Origin recibido.
- Los errores de proveedores se registran del lado servidor y se sustituyen por mensajes genéricos en las respuestas.
- El cliente utiliza únicamente la clave publicable de Supabase; no se encontró una clave service-role en el módulo cliente revisado.
- La ruta pública de catálogo es GET-only, usa la clave de servidor exclusivamente del lado API y proyecta los campos comerciales permitidos.

Estos controles reducen exposición, pero no sustituyen autorización transaccional de las escrituras ERP ni resuelven las carreras de bootstrap/último administrador documentadas en ADMIN-03, ADMIN-07 y ADMIN-15.

### Límite de la revisión

No se ejecutaron solicitudes de mutación, pruebas de fuerza bruta, cambios de contraseña, invitaciones, cambios de roles ni pruebas con JWT manipulados. No se alteraron sesiones, usuarios, configuración de Auth, variables de entorno ni datos de Supabase. Los hallazgos de concurrencia y rate limiting requieren una implementación backend persistente y pruebas controladas antes de cerrarse.


### LOCAL-02 — Lectura segura de colecciones locales de campañas e historial de precios

**Estado: corregido en código — commit `f80936618266932ee4f20230946ba78e411c01dc`.**

En `src/components/ManagementSuite.tsx`, las lecturas iniciales de `difarmas_campaigns` y `difarmas_price_history`, así como el análisis de campañas, ahora pasan por `loadLocalArray`. El helper captura errores de JSON y valida que el valor leído sea un arreglo. Ante datos ausentes, JSON inválido o una estructura inesperada, devuelve una colección vacía sin eliminar ni reescribir la entrada almacenada.

**Impacto:** evita que una entrada local corrupta interrumpa el renderizado de análisis de campañas o historial de precios. No convierte esos datos locales en un registro de auditoría confiable ni resuelve el aislamiento entre cuentas del navegador.

**Verificación:** el cambio de código del commit `f80936618266932ee4f20230946ba78e411c01dc` quedó incluido en el commit de documentación `5db0bfe02e330776ee7845364b4780450970dff4`. GitHub Actions run `41745950055` terminó en `SUCCESS`, con `npm run build` y `npm test` aprobados. Vercel no muestra todavía un Preview para el nuevo HEAD; el último Preview READY corresponde al commit anterior `58bd65565ec6b39e31809740953d2c2827ff3df9`. No se desplegó a producción.


### SESSION-03 / LOCAL-04 — Rechazo de caché ERP heredada sin propietario verificable

**Estado: corregido en código — commit `c914a19f72ee4b9ed4973342d1e452bf6cda0164`.**

En `src/hooks/useErpState.ts`, las claves locales compartidas del ERP ahora solo se hidratan cuando `difarmas_owner_user_id` coincide exactamente con el usuario autenticado. Un marcador ausente ya no se interpreta como propiedad del usuario actual.

Si no existe snapshot remoto y quedan claves ERP locales sin marcador de propietario, la aplicación conserva esas claves intactas y bloquea la sincronización automática con un error explícito. Así evita tanto importar datos de una cuenta desconocida como guardar valores predeterminados encima de la información heredada. Si existe snapshot remoto, este prevalece y se marca al usuario como propietario antes de habilitar escrituras.

**Alcance:** no se borran ni se renombran datos locales. No se implementó una migración automática de registros antiguos porque no hay evidencia confiable para asignarles propietario. La recuperación de una caché sin propietario debe hacerse de forma deliberada y con verificación de identidad.

**Verificación:** GitHub Actions run `41746322203` para el commit de código `f44cc38ad1f1a3dd62db63d035f7b88f42d91529` completó `npm run build` y `npm test` correctamente. No se ha confirmado un Preview Vercel para este commit; el Preview READY más reciente continúa ligado al commit anterior `58bd65565ec6b39e31809740953d2c2827ff3df9`. No se modificó Supabase ni producción.


### LOCAL-05 — Caché del ERP separada por cuenta

**Estado: corregido en código — commit `f44cc38ad1f1a3dd62db63d035f7b88f42d91529`.**

Las escrituras locales de los datos operativos del ERP ahora usan claves namespaced por usuario autenticado (`farmi:user:<userId>:<clave>`). La lectura prioriza esa clave separada. Las claves globales antiguas solo se leen si el marcador `difarmas_owner_user_id` coincide exactamente con el usuario.

Al cambiar de cuenta, si existe un propietario anterior identificado, el sistema copia las claves heredadas a su espacio individual antes de cambiar de usuario. La copia no elimina ni modifica las claves originales. Si el marcador no existe, se mantiene el bloqueo de recuperación descrito en SESSION-03 / LOCAL-04; no se asignan datos heredados por suposición.

**Alcance y límite:** esto reduce la mezcla accidental entre cuentas dentro de la aplicación. No cifra los datos del navegador ni sustituye la autorización del servidor; un usuario con acceso al mismo perfil del navegador o herramientas de desarrollo aún puede inspeccionar el almacenamiento local. Los datos remotos y las reglas RLS siguen siendo la frontera de seguridad principal.

**Verificación pendiente:** CI/build/tests y Preview para el commit nuevo. No se modificó Supabase ni producción.


### DB-04 — Revalidación del estado activo de Supabase (2026-11-04)

**Estado: riesgo confirmado en la base activa; corrección preparada, no aplicada.**

Se volvió a consultar el proyecto Supabase `nreumomoqiwgqbtnhbdy` mediante consultas de catálogo de solo lectura y Security Advisor:

- `public.erp_state` tiene RLS habilitado, con una fila por usuario (3 filas observadas) y políticas SELECT/INSERT/UPDATE.
- Las tres políticas activas todavía usan `coalesce(farmi_active, true)`; un JWT autenticado sin el claim se trata como activo. INSERT/UPDATE también permiten los roles Administrador, Supervisor, Ventas, Compras y Finanzas.
- La migración versionada `202611020001_erp_state_role_write_guard.sql`, que cambia el valor por defecto a falso y aplica autorización estricta, **no está aplicada**. El inventario de migraciones de Supabase devolvió una lista vacía.
- `public.resolve_supplier_credit_note(bigint)` no existe en la base activa; la migración correspondiente sigue siendo solo código preparado.
- `public.store_products` tiene RLS habilitado y una única política de lectura de productos publicados. Los grants INSERT/UPDATE/DELETE existentes para `anon` y `authenticated` no permiten por sí solos escribir porque no existen políticas RLS de escritura. Se recomienda retirar esos grants innecesarios, pero no se modificaron.
- Security Advisor sigue reportando `auth_leaked_password_protection` desactivado.
- Performance Advisor reporta tres políticas de `erp_state` con evaluación de funciones Auth por fila. Es una optimización, no una vulnerabilidad de acceso.

**Acción:** no se aplicaron migraciones, grants, cambios Auth ni escrituras. La corrección de RLS requiere una intervención autorizada en Supabase y verificación posterior de las cuentas existentes. La protección contra contraseñas filtradas debe activarse desde la configuración Auth del proyecto y validarse con el flujo de inicio de sesión.



## Matriz efectiva de permisos de interfaz — revisión 2026-11-04

### PERM-08 — Los permisos de módulo no distinguen lectura de escritura

**Severidad: crítica para el rol Solo lectura; alta para roles funcionales. Estado: confirmado, no corregido.**

En `src/App.tsx` la función `canSee(module)` comprueba únicamente la presencia del módulo en el arreglo de permisos. La misma condición controla la navegación y el montaje del módulo; no existe un permiso independiente de escritura.

El rol `Solo lectura` en `api/admin-users.ts` recibe permisos para ventas, clientes, cotizaciones, inventario, compras, finanzas, cuentas por cobrar/pagar y reportes. Al montar esos módulos, `App.tsx` entrega callbacks/setters mutables, entre ellos:
- POS/facturación: `onComplete={recordSale}`, `onUpdateInvoice={updateStandardInvoice}`, `onCreateCustomer`.
- Clientes/cotizaciones: `setCustomers`, `setQuotes`/guardado de cotizaciones.
- Inventario: apertura de `ProductModal` y `saveProduct`.
- Compras: `setSuppliers`, `setRecords`, `onDispatch`, `onResolve`, `onReceive`.
- Cuentas y finanzas: setters de saldos, transacciones, gastos, movimientos y cierres.

Aunque algunos módulos tengan controles visuales particulares, la capa común no garantiza que un rol de solo lectura no reciba ni invoque callbacks de escritura. Esto se suma a WRITE-10: el snapshot remoto no aplica autorización por módulo en el servidor.

**Corrección requerida:** introducir permisos explícitos `readModules` y `writeModules` (o un mapa de acciones) con validación autoritativa en endpoints/RPC/SQL para cada comando. La UI debe usar esos permisos para ocultar/deshabilitar controles, pero nunca como frontera de seguridad. Antes de migrar roles existentes, definir una matriz aprobada y preservar el acceso de lectura actual sin conceder escritura implícita.

**No se cambió la matriz ni se restringió el rol automáticamente:** el modelo actual no contiene la distinción lectura/escritura y modificarlo sin una migración coordinada podría bloquear tareas legítimas o dejar rutas de escritura sin protección.

### PERM-09 — Los módulos financieros reciben setters sin permiso de acción específico

**Severidad: alta. Estado: confirmado, no corregido.**

La comprobación `activeAllowed` valida la visibilidad de la sección financiera (por ejemplo `finanzas`, `cuentas_cobrar`, `cuentas_pagar`), pero los módulos montados reciben setters para colecciones financieras completas. No hay validación por operación en el servidor ni en el hook de persistencia. La separación visual de secciones no evita que el cliente altere el snapshot JSON completo.

**Corrección requerida:** endpoints transaccionales por acción (gasto, cobro, pago, movimiento, cierre) que validen el claim y el permiso correspondiente, saldo vigente, idempotencia y concurrencia; después retirar a roles funcionales la escritura directa del snapshot completo.

### PERM-10 — Inventario y compras comparten callbacks de edición

**Severidad: alta. Estado: confirmado, no corregido.**

El modal global `ProductModal` se abre desde inventario y desde compras. La autorización para abrirlo depende del estado global `showForm`, y el guardado usa `saveProduct`; no se comprueba un permiso de escritura específico de inventario/compras en el callback común. Los permisos `canSee('inventario')` y `canSee('compras')` no expresan autorización para editar producto o recibir compra.

**Corrección requerida:** validar permisos de acción en el handler común y en el backend; distinguir edición de catálogo, recepción de compra y actualización de costo.

### Límites de esta revisión

- Revisión estática de `App.tsx`, `api/admin-users.ts` y la matriz de roles; no se ejecutaron pruebas con sesiones reales ni escrituras de prueba.
- No se modificaron cuentas, datos, Auth, RLS, grants, políticas ni configuración de Supabase.
- No se alteró `main` ni se desplegó a producción.


### ADMIN-20 — Consulta global de usuarios desde la acción status

**Estado: corregido en código — commit `78e2b2ff84318ca6ebeb0040d65d38d919029c92`.**

La acción `status` ya no ejecuta `listAllUsers()` ni enumera el directorio Auth para decidir si presenta el formulario de bootstrap. Devuelve únicamente el estado de administrador del usuario autenticado y habilita la presentación del formulario cuando no es administrador y existe el secreto configurado.

La acción `bootstrap` mantiene la comprobación global autoritativa: vuelve a listar las cuentas y rechaza el cambio si ya existe un administrador. Por tanto, mostrar el formulario no concede privilegios ni sustituye el control de bootstrap. Esta corrección elimina una consulta global innecesaria en cada carga de configuración.

**Verificación:** CI del commit `78e2b2ff84318ca6ebeb0040d65d38d919029c92` completó build y tests con `SUCCESS`; Vercel Preview de ese commit está `READY`. El commit documental posterior `aaacb5e5dd0158fbc8ff9e3945be8f56b3d022f6` también tiene CI `SUCCESS` y Preview `READY`.


### ADMIN-19 — Unicidad concurrente de nombres de usuario

**Estado: corregido en código y cubierto por pruebas — commit `4021f8880ba5c4d494970b90bd5a1763b6bf162a`; pruebas adicionales en `7d4b7ff2b52a53f376b49557095fb5846a33071d`.**

La creación de cuentas `create-username` ya no enumera todas las cuentas Auth para comprobar previamente el nombre. El nombre se convierte de forma determinista en un correo sintético `<username>@users.farmi.invalid`, y la creación delega la unicidad atómica en la restricción única de correo de Supabase Auth. La respuesta traduce los códigos `email_exists` y `user_already_exists` a HTTP 409.

Esto elimina la carrera de la comprobación `listUsers()` seguida de `createUser()` para las cuentas creadas por este flujo. La unicidad del correo Auth es la garantía autoritativa; no se afirma una restricción SQL independiente sobre el campo metadata `username`.

**Límite:** ADMIN-17 (rate limit persistente de bootstrap) y ADMIN-18 (último administrador bajo concurrencia) siguen abiertos y requieren almacenamiento/operación atómica compartida; no se sustituyen con bloqueos en memoria de una función serverless.



## Verificación adicional — ADMIN-19 / ADMIN-20 — 2026-11-04

El commit `9506edbfe9f0f0157b2170844fbbcc02fcb80387` añadió pruebas automatizadas de la API administrativa para confirmar que:
- La acción `status` responde solo con información del usuario autenticado y no llama a `listUsers()`.
- Una sesión ausente o inválida recibe HTTP 401 sin enumerar cuentas.

El commit `7d4b7ff2b52a53f376b49557095fb5846a33071d` añadió dos pruebas adicionales para ADMIN-19:
- La creación de un nombre de usuario utiliza la operación Auth de creación con el correo sintético determinista, sin consulta previa al directorio.
- Un error Auth `email_exists` se traduce a HTTP 409, también sin enumeración previa.

**Verificación:** GitHub Actions run `41848236570` (commit `9506edb...`) y run `41848521738` (commit `7d4b7ff...`) terminaron en `SUCCESS`; ambos ejecutaron `npm run build` y `npm test`. El Preview Vercel del último commit, deployment `dpl_wDaZbmJzXoFaoVwB9PWQAcdJ6Hx4`, está en estado `READY` y corresponde a la rama `security/erp-state-permission-matrix`.

**Alcance:** solo se añadieron pruebas automatizadas y documentación en la rama aislada. No se cambió `main`, no se promovió el Preview a producción y no se modificó Supabase, Auth ni datos comerciales. ADMIN-17 y ADMIN-18 permanecen abiertos; PERM-08 a PERM-10 y WRITE-01 a WRITE-10 siguen requiriendo una frontera de autorización en servidor/base de datos.



### Pruebas negativas adicionales de autorización administrativa — 2026-11-04

El commit `162feadff17ed53d45e4264a237d658657ce16a0` amplía `api/admin-users.test.ts` con dos pruebas negativas:
- Un usuario autenticado y activo con rol Ventas no puede enumerar cuentas mediante la acción `list`; la API responde HTTP 403 y no llama a `listUsers()`.
- Una cuenta cuyo metadata indica rol Administrador pero carece del claim explícito `farmi_active: true` tampoco puede ejecutar la acción privilegiada; responde HTTP 403 sin enumerar cuentas.

**Verificación:** GitHub Actions run `41849687970` terminó en `SUCCESS`; completó instalación, auditoría de dependencias, `npm run build` y `npm test`. Vercel Preview deployment `dpl_PaSySyDgBk7DdnKuVuKB5T4bgQya` está `READY`, ligado al mismo commit y rama aislada.

**Límite:** estas pruebas verifican el control de acceso de la ruta administrativa. No prueban el rate limit persistente de bootstrap ni la atomicidad del último administrador; ADMIN-17 y ADMIN-18 continúan abiertos.


## IDEMP-01 — Las comprobaciones de duplicados de ventas y compras dependen del snapshot cargado en cada navegador

**Severidad: alta para integridad comercial y conciliación; riesgo de concurrencia, no explotación confirmada.**

### Evidencia directa

En `src/hooks/useErpState.ts`:

- `recordSale` comprueba si ya existe una factura estándar con el mismo número recorriendo el arreglo local `sales`. Si no la encuentra, registra la venta mediante setters React.
- `receivePurchase` comprueba la combinación proveedor + número de factura recorriendo el arreglo local `purchases`. Si no la encuentra, actualiza productos, movimientos, compras, histórico de costos y, si aplica, cuentas por pagar.
- Los identificadores nuevos de ventas y compras se calculan en el cliente con `Date.now()`, el máximo ID presente en el snapshot local y contadores `useRef`.
- Estas comprobaciones no crean una restricción UNIQUE en PostgreSQL ni una operación servidor que reserve el número de factura/procese la compra con idempotencia.
- El autosave persiste el snapshot completo por usuario con control optimista `updated_at`. Ese control evita que una sesión sobrescriba silenciosamente una revisión obsoleta, pero no convierte la comprobación previa de duplicados en una reserva única por número de documento.

### Escenario de riesgo

Dos sesiones del mismo usuario pueden cargar el mismo snapshot, comprobar simultáneamente que un número de factura no existe y aceptar localmente dos operaciones distintas antes de que una sesión reciba los cambios de la otra. El compare-and-swap puede rechazar una de las escrituras si ambas compiten por la misma revisión; no debe considerarse una garantía de idempotencia de negocio ni una restricción única persistente. Tras recargar y reintentar, el resultado depende del flujo de sincronización y no existe una clave de idempotencia de venta/compra validada por servidor.

### Impacto potencial

- Facturas o compras duplicadas si una operación equivalente vuelve a enviarse después de una respuesta incierta o desde otra sesión.
- Duplicación de movimientos de inventario, costos, cuentas por cobrar/pagar y totales asociados.
- Dificultad para conciliar documentos de proveedor o correlativos de facturación.

No se generaron operaciones duplicadas ni se ejecutaron pruebas de concurrencia sobre datos reales. El hallazgo se deriva de la ubicación cliente de la comprobación y de la ausencia de una restricción/operación autoritativa identificada en el flujo revisado.

### Corrección requerida

1. Definir claves de idempotencia estables para cada operación de negocio y persistirlas en servidor.
2. Validar unicidad de documentos con una restricción transaccional apropiada (por ejemplo, ámbito de empresa/usuario + tipo de documento + proveedor/establecimiento + número, según reglas reales del negocio).
3. Mover el registro de venta y recepción de compra a operaciones transaccionales que validen stock, documento, cuenta asociada y movimientos dentro de la misma transacción.
4. Devolver el resultado ya confirmado cuando se reintente la misma clave de idempotencia; rechazar una clave repetida con contenido diferente.
5. Probar dos sesiones concurrentes, reintento tras timeout, doble clic y repetición deliberada de la misma solicitud, verificando que solo exista una operación y un conjunto de movimientos.

### Alcance

Revisión estática de `useErpState.ts` y `remoteErpState.ts` en la rama `security/erp-state-permission-matrix`. No se modificó código funcional, Supabase, RLS, grants, Auth ni datos. No se aplicaron migraciones y no se probó concurrencia contra producción.



## FIN-02 / CASH-05 / RET-02 — Idempotencia y conciliación de cobros, pagos, cierres y devoluciones

**Estado: hallazgos confirmados por revisión estática; sin cambios funcionales ni de datos.**

### FIN-02 — Cobros y pagos no son transacciones atómicas

En `src/components/FinancialModules.tsx` (`ReceivablesModule.collect` y `PayablesModule.pay`) y `src/components/Finance.tsx` (`collect` y `paySupplier`), los flujos calculan el saldo desde el estado del navegador, actualizan `receivables[].paid` o `payables[].paid` mediante setters y agregan por separado una fila a `paymentTransactions`. Los bloqueos `useRef` son locales a cada instancia y se limpian al cambiar las colecciones. Los avisos de éxito se muestran antes de confirmar la persistencia remota.

La revisión de `docs/ERP_PAYMENT_TRANSACTION_SECURITY.md` y `docs/ERP_CASH_CONTROL_SECURITY.md` identifica el escenario concreto de concurrencia: dos operaciones pueden validar contra el mismo saldo previo; el saldo acumulado puede quedar limitado por `Math.min(total, paid + value)`, mientras el historial conserva ambos importes completos. Esto puede desalinear saldo, cobros/pagos y conciliación de caja. El control optimista del snapshot no es una transacción financiera ni una clave de idempotencia.

**Corrección requerida:** una operación servidor por tipo de pago, con autorización por acción, bloqueo de la cuenta, recálculo del saldo, clave de idempotencia única y escritura atómica de saldo + transacción. La interfaz debe mostrar éxito solo con respuesta confirmada y reconciliarse con el resultado del servidor.

### CASH-05 — Cierre diario y movimientos de caja no tienen unicidad autoritativa

En `src/components/Finance.tsx`, `alreadyClosedToday` depende de los cierres cargados localmente y `closingRef` evita únicamente doble pulsación en la instancia actual. El cierre se agrega por setter y se guarda en el snapshot general. No se identificó una restricción única servidor por usuario/caja + fecha de negocio ni una transacción que recalcule y congele los movimientos incluidos. Gastos y movimientos manuales también se crean en el cliente con IDs locales y persistencia diferida.

**Corrección requerida:** endpoint/RPC autorizado para cierre, clave de idempotencia y restricción única por fecha/caja; calcular importes desde movimientos confirmados dentro de la misma transacción. Registrar gastos y movimientos con IDs de servidor y confirmación remota antes de mostrarlos como definitivos.

### RET-02 — Resolución de devolución de proveedor puede repetirse después de liberar el bloqueo local

En `src/hooks/useErpState.ts`, `recordSupplierDispatch` usa estado y movimientos locales para detectar un despacho previo. `resolveSupplierReturn` mantiene un Set de operaciones en curso, pero libera el bloqueo al salir; el Set de completadas se limpia cuando cambia `supplierReturns`. El paso `Cambio recibido` incrementa existencias y agrega movimientos de inventario mediante setters cliente. Una repetición tras un estado obsoleto o entre sesiones no tiene una reserva persistente/única por devolución y puede duplicar la reposición.

El paso `Nota de crédito recibida` intenta una ruta distinta mediante `resolveSupplierCreditNoteAtomically`, pero la RPC correspondiente no existe en la base Supabase activa revisada. Por tanto, no se debe considerar esa protección disponible en el entorno activo hasta instalar y verificar la migración con autorización.

**Corrección requerida:** resolución transaccional e idempotente por ID de devolución y transición de estado, con bloqueo/validación de estado en servidor y escritura atómica de estado + inventario + movimientos o crédito. No basta con mantener un Set en React.

### Alcance y verificación

- Revisión estática de `FinancialModules.tsx`, `Finance.tsx`, `SupplierReturns.tsx`, `useErpState.ts` y servicios de finanzas/créditos/devoluciones en la rama `security/erp-state-permission-matrix`.
- Se confirmó que la base activa no contiene la RPC `resolve_supplier_credit_note(bigint)`; no se aplicó migración.
- No se ejecutaron pagos, cobros, cierres ni devoluciones de prueba sobre datos reales.
- No se modificaron código funcional, Supabase, políticas, grants, Auth, sesiones ni datos comerciales.
- No se tocó `main` ni se promovió el Preview a producción.


## RET-03 / REFUND-03 — Ajustes de venta no recalculan valores desde la factura y el pago se confirma por selección del operador

**Severidad: alta para integridad de devoluciones y conciliación de reembolsos; revisión estática, sin explotación confirmada.**

### REFUND-03 — Valores de devolución confiados al cliente

En `src/hooks/useErpState.ts`, `recordSaleAdjustment` valida que cantidades, precio unitario, impuesto y costo sean finitos/no negativos; comprueba que el importe coincida con los valores enviados y que no supere el total restante de la venta. También valida el identificador de línea, producto y cantidad disponible mediante `canApplySaleAdjustmentItems`.

Sin embargo, la función no compara `unitPrice`, `unitTaxAmount` ni `unitCost` con los valores de la línea original almacenada en `sales[].items`. Por tanto, un cliente con acceso de escritura al snapshot puede enviar una devolución con precio/impuesto/costo distintos a los de la factura, siempre que cumpla las validaciones aritméticas y límites restantes. El precio afecta el importe del ajuste/saldo por cobrar/reembolso y el costo afecta la valuación al reingresar inventario.

**Corrección requerida:** la operación autoritativa debe aceptar identificador de venta, identificador de línea, cantidad y destino de inventario; recuperar precio, impuesto y costo de la venta original en servidor y derivar el importe sin confiar en valores financieros enviados por el navegador. Validar y registrar todo dentro de la misma transacción.

### REFUND-04 — Estado “Pagado” no requiere comprobante ni confirmación independiente

En `src/components/POS.tsx`, el operador puede seleccionar `refundStatus='Pagado'` al crear el ajuste. En `useErpState.ts`, `recordSaleAdjustment` agrega inmediatamente un movimiento de salida cuando el estado es Pagado y el medio seleccionado es efectivo, banco u otro. No se exige referencia bancaria, comprobante, usuario aprobador ni una confirmación independiente de la ejecución del pago. El ajuste y el movimiento se agregan mediante setters al snapshot del navegador.

Esto permite que el registro interno afirme que el reembolso fue liquidado aunque la transferencia/pago real no se haya ejecutado o no se pueda conciliar. No se afirma que se haya producido un pago indebido en datos reales.

**Corrección requerida:** separar aprobación del ajuste y liquidación del reembolso. El reembolso debe permanecer pendiente hasta que una acción autorizada registre importe, medio, fecha, responsable y referencia obligatoria para medios electrónicos; para efectivo, exigir confirmación auditable. Actualizar el estado y crear el movimiento de caja/banco en una sola operación servidor idempotente. El excedente de ventas a crédito necesita un pasivo/saldo a favor del cliente explícito y conciliable.

### RET-03 — Bloqueo de ajustes de venta solo local

`recordSaleAdjustment` usa `saleAdjustmentInProgress` (Set en memoria) y valida los ajustes existentes desde el snapshot cargado. El bloqueo se limpia cuando cambia `saleAdjustments`. POS tiene además `adjustmentSubmissionLocks`, también local y limpiado al cambiar el arreglo. No existe reserva única/operación transaccional por venta o clave de idempotencia compartida entre dispositivos. Dos sesiones con la misma revisión pueden validar cantidades pendientes de una misma línea antes de que una conozca el ajuste de la otra.

**Corrección requerida:** clave de idempotencia y transición transaccional por venta/línea; bloquear y recalcular cantidades disponibles en servidor antes de actualizar inventario, saldo, ajuste y movimientos.

### Alcance y estado

- Revisión estática de `POS.tsx`, `useErpState.ts`, `saleAdjustmentService.ts` y pruebas unitarias de proyección.
- Las pruebas existentes cubren proyección neta, cantidades por línea y límites en funciones puras; no prueban una escritura transaccional concurrente ni la validación de precios frente a la factura original.
- No se ejecutaron devoluciones ni pagos sobre datos reales.
- No se modificó código funcional, Supabase, políticas, grants, Auth ni datos.
- La corrección requiere una operación servidor transaccional y un modelo explícito de conciliación; no se implementó una mitigación parcial de interfaz.


## REPORT-04 / CASH-06 — Reportes y cierres siguen usando importes brutos y nombres visibles de métodos

**Severidad: alta para exactitud de reportes; media para conciliación de efectivo. Estado: revisión estática.**

### REPORT-04 — Resumen financiero y reporte de ventas no aplican los ajustes registrados

En `src/components/FinancialModules.tsx`, `ReportsModule` no recibe `saleAdjustments` en sus props. Calcula `totalSales` sumando directamente `sales[].total`, y el reporte `ventas` lista `sales[].total` original. En `src/components/Finance.tsx`, el resumen usa `sumSales(sales)` y `sumProfit(sales)`, que suman valores brutos de `SaleRecord`. La proyección neta `applySaleAdjustmentsToSales` existe en `saleAdjustmentService.ts`, pero estos dos módulos no la consumen.

**Impacto:** una devolución parcial o anulación puede dejar ventas, utilidad y reportes de período mostrando importes originales, aunque el ajuste esté registrado. Esto produce diferencias entre reportes, saldos por cobrar, inventario y caja. La venta original debe preservarse como documento histórico, pero el resumen necesita mostrar bruto, ajustes y neto de forma separada.

**Corrección requerida:** integrar una proyección neta común para métricas y reportes, con fecha del documento original y fecha del ajuste claramente diferenciadas. Mostrar bruto, devoluciones/anulaciones y neto; no alterar documentos históricos. Añadir pruebas de reporte para devolución parcial, anulación, devolución sin reingreso y períodos que cruzan fechas.

### CASH-06 — Clasificación de ventas en efectivo usa el nombre visible y no el tipo estable del método

En `src/services/financeService.ts`, `cashSales` clasifica como efectivo únicamente `paymentKind === 'cash'` o, para registros legacy, `payment === 'Efectivo'`. En `src/components/Finance.tsx`, `daySales` aplica la misma excepción legacy basada en texto exacto. El POS permite métodos configurables y conserva `paymentKind`, pero los registros legacy sin ese campo dependen del nombre mostrado.

**Impacto:** las ventas históricas con un método renombrado o un nombre alternativo configurado como efectivo pueden quedar fuera del flujo y cierre de caja; el nombre visible no es una categoría contable estable. La misma clase de inconsistencia puede aparecer si los módulos financieros mantienen listas de métodos limitadas a «Efectivo» y «Transferencia».

**Corrección requerida:** conservar un tipo estable del método en cada transacción y utilizarlo de forma uniforme en flujo, cierre y reportes. Definir una estrategia de compatibilidad para datos legacy sin reclasificar automáticamente movimientos históricos. Añadir pruebas con método de efectivo personalizado, método bancario personalizado y ventas legacy.

### Verificación del alcance

- Revisados `ReportsModule`, `Finance.tsx`, `financeService.ts`, `saleAdjustmentService.ts` y pruebas de proyección.
- Las pruebas existentes de `saleAdjustmentService` cubren la proyección pura, pero no su integración en reportes/cierres ni conciliación con transacciones reales.
- No se ejecutaron cierres, pagos, devoluciones ni escrituras sobre datos reales.
- No se modificó código funcional ni Supabase; no se aplicaron migraciones ni se promovió producción.


## SUPPLIER-CREDIT-04 / SUPPLIER-CREDIT-05 — Importe de nota no verificado y aplicaciones repetibles

**Severidad: alta para integridad de cuentas por pagar y saldos a favor. Estado: confirmado por revisión estática; migración propuesta no aplicada en Supabase activa.**

### SUPPLIER-CREDIT-04 — La nota de crédito se calcula desde el costo de devolución, no desde el documento recibido

En `supabase/migrations/202611020002_supplier_credit_note_atomic.sql`, la RPC asigna `v_note := (v_return ->> 'totalCost')::numeric` y utiliza ese valor para reducir la cuenta por pagar o crear un saldo a favor. La función local `resolveSupplierReturn` invoca la RPC al marcar «Nota de crédito recibida». El tipo `SupplierReturnRecord` no contiene importe del documento de crédito recibido, número/serie de esa nota, fecha de emisión ni evidencia de conciliación.

La RPC sí bloquea la fila `erp_state`, verifica que la devolución esté «Enviado al proveedor», busca una compra del mismo proveedor y evita crear un segundo crédito para el mismo `sourceReturnId`. Esos son controles positivos, pero no acreditan que el importe aceptado coincida con el documento emitido por el proveedor. Tampoco se cotejan las cantidades/costos de cada línea devuelta contra los artículos de la compra original.

**Impacto:** un `totalCost` erróneo o manipulado en el snapshot podría disminuir el saldo del proveedor o crear crédito futuro por una cantidad distinta de la reconocida por el proveedor. La transacción atómica protege la concurrencia, pero no convierte el importe de origen en un dato verificado.

**Corrección requerida:** capturar número, fecha e importe del documento de crédito recibido y su evidencia; conciliarlo con las líneas/cantidades de la devolución y compra original; exigir aprobación de diferencias. El servidor debe calcular el máximo conciliable y guardar importe reconocido, importe reclamado y diferencia por separado. No asumir que el costo contable de los artículos equivale automáticamente al importe fiscal/comercial de la nota.

### SUPPLIER-CREDIT-05 — La aplicación de crédito a una compra carece de clave de idempotencia por compra

En `src/services/supplierCreditService.ts`, `applySupplierCreditsToPurchase` consume el saldo disponible y agrega un elemento a `applications` con `purchaseId`, pero no comprueba si ese `purchaseId` ya está aplicado en el historial de créditos. La función es determinista para una entrada, pero dos llamadas con el mismo snapshot pueden producir la misma aplicación. `receivePurchase` evita algunas facturas repetidas comparando proveedor y número de factura en el estado local; no es una restricción compartida ni cubre compras sin número de factura.

**Impacto:** una repetición desde otra sesión o un reintento con estado anterior puede volver a aplicar un crédito y duplicar el efecto contable si se acepta la segunda compra. Los bloqueos locales y la comparación de facturas no constituyen idempotencia transaccional entre dispositivos.

**Corrección requerida:** la operación servidor debe aceptar una clave idempotente estable para la compra, reservarla de forma única y devolver el resultado ya confirmado en reintentos. En la misma transacción debe validar saldo disponible, proveedor, compra, cuenta por pagar y aplicación previa. Añadir pruebas de doble envío, dos sesiones y timeout después de confirmar.

### SUPPLIER-CREDIT-06 — El validador del ledger no reconcilia el saldo con el importe y las aplicaciones

`isValidCredit` comprueba proveedor, saldo restante no negativo y que `applications` sea un arreglo, pero no valida que `amount` sea finito/positivo, que los importes de cada aplicación sean válidos, que la suma de aplicaciones coincida con `amount - remainingBalance`, ni que no existan `purchaseId` duplicados. `applySupplierCreditsToPurchase` confía en ese estado al consumir saldos.

**Impacto:** un registro persistido inconsistente puede seguir siendo aceptado por el servicio local y contaminar el saldo disponible o el historial de aplicaciones. Al tratarse de snapshot editable desde el cliente, la validación local no es una barrera de integridad.

**Corrección requerida:** validar el ledger completo y rechazar inconsistencias antes de calcular; reconstruir saldos desde movimientos de crédito/aplicación inmutables en una operación servidor transaccional. No reparar automáticamente registros históricos sin conciliación.

### Estado de despliegue y base activa

La migración `202611020002_supplier_credit_note_atomic.sql` existe en la rama, y el cliente llama a `resolve_supplier_credit_note`; sin embargo, la comprobación previa de Supabase activa indicó que la función no existe y que la migración no estaba aplicada. Por ello, el control atómico documentado en el código no está disponible en la base activa. No se intentó aplicar la migración ni se modificó Supabase en esta auditoría.

### Pruebas existentes y brechas

Las pruebas actuales de `supplierCreditService` cubren división de nota, consumo parcial/total, proveedores distintos, precisión en centavos y prevención de crear dos créditos para un mismo `sourceReturnId`. No cubren importes de nota no conciliados, aplicaciones duplicadas para un `purchaseId`, ledger inconsistente ni concurrencia entre sesiones.


## VOID-04 — Anulaciones internas sin identidad del actor ni aprobación independiente

**Severidad: alta para trazabilidad y control de anulaciones. Estado: confirmado por revisión estática.**

El tipo `SaleAdjustmentRecord` contiene ID, venta, factura, tipo, fecha, motivo, líneas, importe, medio/estado del reembolso y notas; no contiene identidad del usuario que solicitó/registró el ajuste, aprobador, fecha de aprobación, motivo codificado, referencia al documento fiscal de crédito ni evidencia de liquidación. En `POS.tsx`, el operador selecciona «Anulación» y puede seleccionar directamente «Reembolso pagado»; `recordSaleAdjustment` aplica los cambios mediante setters del estado. La función del dominio no recibe un actor ni un contexto de autorización por acción.

El mensaje de interfaz aclara que una anulación interna no sustituye el procedimiento fiscal oficial, pero esa advertencia no crea un control auditable.

**Impacto:** una revisión posterior no puede atribuir de forma fiable quién registró o autorizó una anulación, distinguir solicitante de aprobador, ni conciliar la operación con la nota de crédito o el comprobante real de devolución. La visibilidad del módulo `ventas` no equivale a permiso de anular o liquidar reembolsos.

**Corrección requerida:** separar solicitud, aprobación y liquidación; guardar actor autenticado, rol/permisos evaluados, actor aprobador distinto cuando la política lo requiera, fecha, motivo, documento relacionado y referencia de pago. La autorización debe comprobarse en servidor dentro de la operación transaccional, no confiar en campos enviados por el navegador. Mantener historial inmutable y auditable. No añadir campos al snapshot como sustituto de un registro servidor protegido.


## INV-01 / INV-02 — Precio/costo de venta y movimientos de inventario confiados al snapshot del navegador

**Severidad: alta para integridad de ventas, costo de ventas e inventario. Estado: confirmado por revisión estática; no se ejecutaron ventas ni escrituras reales.**

### INV-01 — El registro de venta no contrasta precio ni costo del carrito con el maestro de productos

En `src/hooks/useErpState.ts`, `recordSale(sold, ...)` valida cantidades, existencia disponible y que los valores pasen las comprobaciones de `applySaleToInventory`. En `src/services/inventoryService.ts`, esa función valida que precio y costo del elemento del carrito sean finitos/no negativos, y que la cantidad no supere el stock; sin embargo, no compara `sold[].price` ni `sold[].cost` con los precios/costos del producto correspondiente en `products`. Después, `buildSaleRecord` en `src/services/salesService.ts` construye el total, costo, utilidad y líneas históricas directamente con los valores del carrito.

**Impacto:** una solicitud cliente alterada podría registrar una venta con precio inferior al autorizado o costo manipulado, manteniendo una reducción de existencias válida. Esto puede distorsionar ingresos, utilidad, costo de ventas, cuentas por cobrar y reportes. La validación de stock evita vender unidades inexistentes en el snapshot actual, pero no convierte el precio/costo del carrito en datos confiables.

**Corrección requerida:** la operación de venta debe recibir solo identificadores de producto/línea, cantidades, lista de precio y descuentos autorizados. El servidor debe recuperar precio, costo, impuesto, promociones y existencia vigentes, validar límites y calcular importes; los cambios de stock, venta, cuenta por cobrar, caja e historial de movimientos deben confirmarse en una sola transacción idempotente. Registrar explícitamente descuentos autorizados y actor.

### INV-02 — Recepción de compra y ajustes manuales también actualizan el ledger desde el cliente

En `receivePurchase`, `useErpState.ts` acepta `PurchaseItem[]` recibidos del componente, aplica `applyPurchaseToInventory` con `item.qty` y `item.unitCost`, y acepta `enteredTotal` como total de la compra cuando es finito y no negativo, sin conciliarlo con el total calculado de las líneas. El mismo flujo agrega movimientos de inventario, compra, historial de costos y cuenta por pagar mediante setters del estado. En `saveProduct`, un usuario que edita un producto puede cambiar directamente `stock`; el hook crea un movimiento de ajuste, pero no exige motivo estructurado, documento de respaldo o aprobación. `deleteProduct` puede eliminar un producto que aún tiene existencias, registrando una salida genérica y quitándolo del catálogo.

**Impacto:** cantidad/costo recibido y total financiero pueden divergir; una edición manual puede alterar existencias sin un flujo de conteo/ajuste con aprobación; la eliminación de un artículo con stock deja el historial referenciado a un producto que ya no aparece en el catálogo. Son cambios contables y de trazabilidad originados en el cliente, no operaciones de inventario autoritativas.

**Corrección requerida:** recibir la compra desde un documento validado en servidor, conciliar suma de líneas, descuentos, impuestos y total de factura, y escribir compra + stock + costo promedio + cuenta por pagar + movimientos atómicamente. Separar ajuste de inventario de edición del producto: requerir motivo, cantidad delta, actor y aprobación según umbral; conservar productos con movimientos históricos mediante baja lógica, no borrado físico del registro maestro.

### Verificación de permisos efectivos

En `src/App.tsx`, `canSee(module)` se utiliza para decidir navegación y montaje del módulo; `activeAllowed` exige cuenta activa y permiso del módulo, pero no comprueba permisos separados de lectura/escritura. El módulo Inventario recibe `onNew` y `onEdit` sin un indicador de capacidad de escritura; el modal recibe `onSave` y `onDelete`. El hook `useErpState` no recibe el rol ni permisos del usuario para proteger `saveProduct`, `deleteProduct`, `recordSale` o `receivePurchase`. Esto confirma que el control de módulo no es autorización por acción. La posibilidad de persistir una modificación depende además de las políticas RLS activas descritas en AUTHZ-03; ocultar botones o bloquear la interfaz no sustituye la validación servidor.

**Corrección requerida:** definir permisos separados de lectura y escritura por dominio/acción y hacer que cada operación servidor los evalúe contra la identidad autenticada. No basta con añadir deshabilitados en React ni con restringir solo el menú.

### Alcance

- Revisados `src/App.tsx`, `src/components/Inventory.tsx`, `src/hooks/useErpState.ts`, `src/services/inventoryService.ts`, `src/services/inventoryMovementService.ts` y `src/services/salesService.ts`.
- Se revisaron los puntos de validación de venta, compra, ajuste manual y eliminación; no se ejecutaron solicitudes manipuladas ni operaciones sobre datos reales.
- No se modificó código funcional, Supabase, RLS, grants, Auth ni datos comerciales. No se aplicaron migraciones ni se promovió el Preview a producción.


## INV-03 — Las líneas fiscales de una factura estándar no se concilian con las líneas que descuentan inventario

**Severidad: alta para integridad de facturación, inventario y cuentas por cobrar. Estado: confirmado por revisión estática; sin operaciones reales.**

En `recordSale` de `src/hooks/useErpState.ts`, el inventario se actualiza usando `sold` mediante `applySaleToInventory(products, sold)`. Sin embargo, cuando se recibe `invoiceDetails`, el total de la venta se calcula sumando `invoiceDetails.lines[].lineTotal`; las líneas históricas se construyen a partir de `sold` y se enriquecen buscando la primera fila de `invoiceDetails.lines` cuyo `productId` coincida. No se valida que las dos listas tengan el mismo número de renglones, los mismos productos, cantidades iguales, ni que no existan filas fiscales adicionales o repetidas. Tampoco se recalculan/validan en esta operación los importes de neto, descuento, impuesto y total de línea a partir de datos autorizados.

**Impacto:** una solicitud alterada puede incluir una línea fiscal adicional que incremente el total y la cuenta por cobrar sin descontar ese producto del inventario; también puede omitir una línea fiscal, duplicar un producto o presentar cantidades e importes que no correspondan al carrito. Si hay varios renglones del mismo producto, la búsqueda por `productId` no distingue la identidad de cada línea y puede asociar repetidamente los mismos importes fiscales.

**Corrección requerida:** el servidor debe aceptar identificadores de línea y cantidades, reconstruir la relación entre cada línea de factura y su producto, comprobar que cada producto y cantidad coincidan con la operación de inventario, validar lista de precio, descuentos, ISV y total, y calcular todos los importes. Debe guardar factura, stock, movimientos y CxC en una transacción con idempotencia y auditoría. El cliente no debe poder aportar una lista independiente de totales fiscales como fuente autoritativa.

**Alcance:** se revisó el camino de creación `recordSale(..., invoiceDetails)`; el hallazgo complementa los riesgos ya documentados para `updateStandardInvoice`. No se ejecutaron solicitudes manipuladas, no se emitieron facturas, no se modificó código funcional ni se alteró Supabase.


## CASH-07 — El cierre diario puede atribuir diferencias históricas al último día de pago

**Severidad: media-alta para la exactitud del arqueo diario. Estado: confirmado por revisión estática; no se ejecutaron pagos ni cierres reales.**

En `src/components/Finance.tsx`, los cálculos `dayCollections` y `daySupplierPayments` comparan el acumulado de `receivables[].paid` o `payables[].paid` con la suma de las transacciones guardadas en `paymentTransactions`. Cuando existe al menos una transacción para la cuenta, el código calcula `legacyUnrecorded = Math.max(0, paid - recorded)` y, si `lastPaymentDate` corresponde al día actual, incorpora toda esa diferencia al cierre de hoy. Además, la parte no conciliada se trata como efectivo por defecto cuando no existe un método individual que permita clasificarla.

**Impacto:** si el historial de transacciones está incompleto y se registra hoy un nuevo abono, `lastPaymentDate` pasa a ser hoy, pero la diferencia acumulada puede incluir abonos anteriores sin detalle. El cierre puede atribuir ese saldo histórico completo al efectivo del día, sobrestimando entradas o salidas y alterando el efectivo esperado. El mismo supuesto afecta cobros de clientes y pagos a proveedores. Si las transacciones acumuladas exceden el campo `paid`, el cálculo tampoco genera una alerta de conciliación: simplemente limita la diferencia no registrada a cero.

**Corrección requerida:** no inferir fecha ni medio de pago de una diferencia acumulada. Marcar la cuenta como pendiente de conciliación cuando `paid` y la suma de transacciones no coincidan; conservar los movimientos históricos sin fecha/método como saldo no conciliado, fuera del arqueo diario hasta revisión documentada. En el nuevo modelo, cada pago debe guardar su fecha, medio, referencia y cuenta relacionada en un ledger inmutable, y los saldos deben derivarse de ese ledger en una operación servidor transaccional. Añadir pruebas para historial parcial, transacciones mayores al saldo abonado, abonos de días distintos y pagos de hoy con legado sin conciliar.

**Alcance:** revisados `src/components/Finance.tsx`, `src/components/FinancialModules.tsx`, `src/services/financeService.ts` y `src/services/financeService.test.ts`. La revisión también confirmó que pagos parciales actualizan saldo e historial mediante setters separados del navegador, ya cubierto por CASH-06. No se modificó código funcional, Supabase ni datos comerciales.


## CASH-08 — El registro histórico de cierre omite el detalle de movimientos manuales

**Severidad: media. Estado: confirmado por revisión estática; no se ejecutaron cierres reales.**

En `src/components/Finance.tsx`, `expected` se calcula incluyendo `dayMovementIn` y `dayMovementOut` mediante `calculateExpectedCash`. Sin embargo, `closeCash` llama `createCashClosure` pasando saldo inicial, ventas, cobros, gastos, pagos a proveedores, esperado, contado, nota, fecha, compras contado e ID; no pasa los totales de entradas/salidas manuales ni referencias de los movimientos. `src/services/financeService.ts` construye `CashClosure` con esos importes parciales y no conserva movimientos incluidos. El tipo `CashClosure` tampoco contiene campos para entradas/salidas manuales o referencias a movimientos. El historial de cierres muestra esperado, contado, diferencia, compras contado y nota, sin desglose de otras entradas/salidas.

**Impacto:** el saldo esperado del cierre puede incluir aportes, retiros, préstamos u otras entradas/salidas manuales, pero el cierre guardado no permite reconstruir qué movimientos explican ese total. Si un movimiento manual se edita o desaparece del snapshot posterior, el historial del cierre carece de una referencia inmutable para verificar el cálculo original. Esto reduce la trazabilidad de arqueos y la investigación de diferencias.

**Corrección requerida:** guardar en cada cierre un desglose inmutable de entradas/salidas por categoría y sus IDs de movimiento, o un snapshot completo de los movimientos que participaron, además de los totales. Validar que la suma del desglose concuerde con el efectivo esperado. No permitir editar/eliminar movimientos ya incluidos en un cierre; las correcciones deben ser movimientos compensatorios con actor, motivo y referencia. La operación de cierre debe ejecutarse en servidor con unicidad por caja/fecha y transacción que bloquee el cierre y capture los movimientos incluidos.

**Alcance:** revisados `src/components/Finance.tsx`, `src/services/financeService.ts` y `src/domain/types.ts`. La prevención de cierres duplicados entre dispositivos ya está documentada en CASH-05; este hallazgo cubre la falta de evidencia y desglose persistente del cierre. No se modificó código funcional, Supabase ni datos financieros.


## FIN-03 — Gastos y movimientos manuales carecen de evidencia y atribución de autor

**Severidad: media para trazabilidad financiera; alta si se usan como soporte de arqueos o conciliación. Estado: confirmado por revisión estática; no se registraron operaciones reales.**

En `src/components/Finance.tsx`, `addExpense` valida que exista descripción y que el importe sea finito y positivo, y luego crea un `Expense` con categoría, fecha generada por el navegador y forma de pago. El formulario no solicita número de documento, proveedor/beneficiario, referencia bancaria, comprobante, motivo detallado ni identidad del usuario que registra o autoriza el gasto. El tipo `Expense` de `src/domain/types.ts` solo conserva `id`, `description`, `amount`, `category`, `date` y `paymentMethod`.

El formulario de movimientos manuales valida descripción e importe positivo y llama `addCashMovement`; el tipo `CashMovement` solo conserva `id`, `type`, `description`, `amount`, `category` y `date`. Tampoco se guarda actor, aprobador, referencia o evidencia documental. La fecha se genera en el navegador, no se recibe de una fuente de tiempo autoritativa del servidor. En la vista revisada, los gastos y movimientos se muestran como listas de solo lectura: no se encontraron controles funcionales para editar o eliminar esos registros desde esos apartados. Esta observación no demuestra inmutabilidad: ambos arreglos se persisten dentro del snapshot de `erp_state`, cuyo riesgo de escritura amplia desde el cliente ya está documentado en AUTHZ-03.

**Impacto:** ante una diferencia de caja, un gasto o aporte/retiro manual puede tener descripción e importe, pero no existe información suficiente para asociarlo inequívocamente a una factura, recibo, transferencia, beneficiario o persona responsable. La fecha local puede no coincidir con la fecha efectiva de la operación. La falta de evidencia también dificulta auditar gastos duplicados, movimientos mal clasificados o correcciones posteriores. El hecho de que la interfaz no ofrezca botones de edición/eliminación no protege el registro frente a modificaciones del snapshot por rutas de escritura que ya se analizaron en AUTHZ-03.

**Corrección requerida:** modelar los gastos y movimientos como eventos financieros con actor autenticado, fecha/hora de servidor, identificador único generado y validado en servidor, categoría controlada, referencia documental y evidencia cuando corresponda. Exigir motivo y aprobación según importe/tipo; conservar el evento original y corregirlo mediante reverso o asiento compensatorio vinculado, nunca sobrescribirlo o borrarlo. Aplicar permisos de escritura por acción y registrar la operación en un ledger append-only con restricciones e idempotencia. Los totales de caja deben derivarse de esos eventos validados y conciliables.

**Alcance:** revisados `src/components/Finance.tsx`, `src/services/financeService.ts`, `src/domain/types.ts` y los efectos de persistencia de gastos/movimientos en `src/hooks/useErpState.ts`. No se modificó código funcional, Supabase, RLS, Auth ni datos financieros; no se ejecutaron gastos, movimientos ni cierres reales. Este hallazgo complementa CASH-08 (el cierre no conserva desglose) y AUTHZ-03 (escritura amplia del snapshot), sin volver a clasificar esos riesgos como nuevos.



## CASH-09 — El saldo inicial del cierre puede modificarse sin conciliación con el cierre anterior

**Severidad: media-alta para la integridad del arqueo diario. Estado: confirmado por revisión estática; no se ejecutaron cierres reales.**

En `src/components/Finance.tsx`, un efecto selecciona el cierre con la fecha más reciente y, si el estado local `opening` vale cero, inicializa el saldo inicial con `latest.counted`. Sin embargo, el campo «Saldo inicial de caja» permanece editable y `closeCash` solo comprueba que `opening` sea finito y no negativo. No compara el importe introducido con el efectivo contado en el último cierre ni exige una razón/aprobación para ajustar el fondo inicial. `calculateExpectedCash` usa directamente ese valor para calcular el efectivo esperado, y `createCashClosure` lo conserva como apertura del nuevo cierre.

**Impacto:** una persona con acceso a la pantalla puede sustituir el saldo inicial heredado por otro importe y cambiar el efectivo esperado y la diferencia del arqueo sin dejar una conciliación que explique el ajuste. La existencia de un cierre anterior no hace que su saldo contado sea vinculante. El bloqueo local de un cierre por día no valida la continuidad entre cierres ni impide una modificación del snapshot.

**Corrección requerida:** derivar la apertura del último cierre confirmado en el servidor para la caja correspondiente; no aceptar un importe libre del navegador como fuente autoritativa. Si se requiere fondo inicial distinto, registrarlo como movimiento de ajuste/apertura separado, con actor autenticado, motivo, evidencia y aprobación según política. La operación debe validar secuencia temporal, caja/turno y cierre previo en una transacción, conservar el valor de apertura y su procedencia en el historial inmutable, y aplicar idempotencia/unicidad por caja y fecha.

**Alcance:** revisados `src/components/Finance.tsx` (inicialización de `opening`, cálculo `expected`, campo editable y `closeCash`), `src/services/financeService.ts` (`calculateExpectedCash` y `createCashClosure`) y `src/domain/types.ts` (`CashClosure`). Este hallazgo es distinto de CASH-08: CASH-08 cubre el desglose de movimientos omitido en el registro histórico; CASH-09 cubre la ausencia de validación de continuidad del saldo inicial. No se modificó código funcional, Supabase, RLS, Auth ni datos financieros; no se ejecutaron cierres reales.



## SUPABASE-LIVE-01 — La protección propuesta en migraciones no está activa en la base consultada

**Severidad: alta. Estado: confirmado mediante consultas SQL de solo lectura el 2026-11-04.**

Se consultó el proyecto Supabase activo configurado para FARMI, sin leer filas de negocio ni modificar datos. La función `public.resolve_supplier_credit_note(bigint)` no existe en el catálogo de funciones de `public`; por tanto, el RPC que invoca `resolveSupplierCreditNoteAtomically` no puede considerarse operativo en esa base. Las pruebas Vitest agregadas para el cliente simulan `client.rpc` y no sustituyen una prueba PostgreSQL real.

La tabla `public.erp_state` tiene RLS habilitado y una clave primaria única por `user_id`. Los permisos de tabla observados para `authenticated` incluyen SELECT, INSERT y UPDATE. Las políticas activas consultadas permiten SELECT por propietario con `farmi_active` ausente interpretado como verdadero; INSERT/UPDATE requieren propietario, actividad (también con valor predeterminado verdadero) y uno de los roles Administrador, Supervisor, Ventas, Compras o Finanzas. No se observó una política de DELETE. Estas políticas no comprueban `farmi_permissions` ni permisos granulares por módulo.

La migración del repositorio `202611020001_erp_state_role_write_guard.sql` propone cambiar el valor predeterminado de `farmi_active` a falso, pero no coincide con las políticas actualmente activas. La migración `202611020002_supplier_credit_note_atomic.sql` tampoco está instalada, como confirma la ausencia de la función. No se debe inferir que los archivos SQL del repositorio ya fueron aplicados.

**Impacto:** la rama contiene controles y pruebas que aún no están desplegados en la base activa. El acceso directo de INSERT/UPDATE del snapshot continúa vigente para los roles indicados y no aplica autorización por permiso de módulo. El flujo de nota de crédito depende de un RPC inexistente en esa base.

**Acción segura:** mantener ambas migraciones sin aplicar en la base activa hasta disponer de un entorno aislado sin coste adicional o un procedimiento de staging aprobado, validar compatibilidad y ejecutar pruebas de integración PostgreSQL. Después, planificar el despliegue de forma coordinada con la aplicación. No revocar INSERT/UPDATE ni activar el trigger de matriz de permisos mientras el cliente de producción siga dependiendo de escrituras directas del snapshot.

**Alcance de la verificación:** consultas de catálogo sobre existencia de función, políticas RLS, privilegios de tabla e índices; no se consultaron filas de `erp_state`, usuarios ni datos comerciales. No se ejecutó DDL, DML, migración ni cambio de configuración.


## FIN-03 — Cobros y pagos actualizan saldos e historial en dos escrituras de estado cliente

**Severidad: crítica para integridad financiera. Estado: confirmado por inspección estática el 2026-11-04.**

En `src/components/Finance.tsx`, `collect` actualiza `receivables[].paid` y por separado antepone un registro a `paymentTransactions`. `paySupplier` hace lo mismo con `payables[].paid` y el historial de pagos. El bloqueo `paymentLocks` vive en un `useRef` del componente y se limpia cuando cambian las colecciones. Los IDs se generan en el navegador.

**Impacto:** las dos mutaciones no son una transacción indivisible ni una operación idempotente en base de datos. Dos sesiones/dispositivos pueden leer el mismo saldo y registrar cobros/pagos concurrentes; también puede persistirse un saldo sin su movimiento correspondiente si el estado se guarda entre cambios o falla parte de la sincronización. El bloqueo local no coordina dispositivos y no impide peticiones directas.

**Acción necesaria:** RPC transaccionales separados para cobrar una cuenta y pagar una cuenta por pagar; bloquear la fila de cuenta, comprobar saldo vigente, monto positivo y método/referencia, registrar movimiento inmutable con actor/fecha generados en servidor, y usar una clave de idempotencia única. El saldo debe derivarse/actualizarse dentro de la misma transacción. No activar hasta migrar el cliente y probar en staging.

## CASH-10 — El cierre diario depende de datos y bloqueos del navegador

**Severidad: crítica para integridad de caja. Estado: confirmado por inspección estática el 2026-11-04.**

En `src/components/Finance.tsx`, `closeCash` calcula el cierre con valores ya agregados en el cliente (`daySales`, `dayCollections`, `dayExpenses`, `daySupplierPayments`, compras en efectivo y movimientos). La apertura se mantiene en estado React (`opening`) y se inicializa desde el último cierre visible; el control de duplicado consulta `closures` cargados en esa sesión. `closingRef` solo bloquea doble clic en el componente y se reinicia al cambiar `closures`. Finalmente, el cierre se añade mediante `setClosures`, sin confirmación transaccional de servidor.

**Impacto:** dos sesiones pueden intentar cerrar el mismo día; una sesión desactualizada puede calcular cifras incompletas; el navegador puede alterar la apertura, conteo o datos fuente antes de guardar. La comprobación `alreadyClosedToday` no es una restricción única en PostgreSQL y no protege contra concurrencia.

**Acción necesaria:** cierre mediante RPC transaccional con una restricción única por cuenta/fecha/turno; calcular totales desde operaciones verificadas en base de datos, usar saldo de apertura derivado del cierre anterior, validar conteo y diferencia, registrar actor y fecha de servidor, y conservar ajustes con motivo/evidencia. Rechazar cierres repetidos de forma idempotente. Mantener la pantalla actual como captura de conteo, no como autoridad del cálculo.

## SALES-11 — Validaciones de venta e inventario son exclusivamente cliente

**Severidad: alta. Estado: confirmado por inspección estática el 2026-11-04.**

En `src/hooks/useErpState.ts`, `recordSale` comprueba cantidades, existencia disponible, duplicidad de número de factura y aplica `applySaleToInventory` en memoria; después actualiza por separado productos, movimientos, ventas y cuentas por cobrar mediante setters. El precio y los datos de líneas llegan desde objetos del cliente. No se encontró en esta ruta una transacción de base de datos que vuelva a validar precio, stock, total, número de factura e idempotencia.

**Impacto:** esas comprobaciones mejoran la experiencia normal, pero no resisten un cliente manipulado ni evitan ventas concurrentes desde dos dispositivos que consuman el mismo stock. Las escrituras del snapshot completo no hacen atómica la venta y su movimiento de inventario.

**Acción necesaria:** RPC de registro de venta que reciba líneas y una clave idempotente, valide permisos y precios autorizados, bloquee/actualice stock en transacción, calcule importes en servidor, genere la venta y sus movimientos y, si corresponde, la cuenta por cobrar. Rechazar stock insuficiente y número fiscal duplicado con índices/constraints de base de datos.

## PURCHASE-07 — Recepción de compra y efectos derivados se construyen en el cliente

**Severidad: alta. Estado: confirmado por inspección estática el 2026-11-04.**

En `src/hooks/useErpState.ts`, `receivePurchase` valida cantidades y costos no negativos, comprueba duplicidad de factura contra el arreglo local `purchases`, calcula el total a partir de líneas pero acepta `enteredTotal` como total final si es un número finito no negativo. Después actualiza en memoria inventario, movimientos, compras, créditos aplicados, historial de costos y cuentas por pagar mediante setters separados.

**Impacto:** la comprobación de factura duplicada es local; el total aceptado puede diferir de la suma de líneas y no se valida en servidor; la recepción y sus efectos contables/inventario no son atómicos. Un error o concurrencia puede dejar colecciones incoherentes.

**Acción necesaria:** RPC de recepción que valide proveedor, factura única por proveedor, líneas, cantidades, costos, impuestos/descuentos y total conciliado; aplique créditos disponibles y genere inventario, movimientos, costo histórico y cuenta por pagar en una única transacción con clave idempotente. Antes de imponer conciliación exacta, documentar y modelar impuestos, fletes, descuentos y otros cargos legítimos que puedan explicar diferencias.

**Límite de la revisión:** estos cuatro hallazgos proceden de lectura de código y no de una prueba de explotación ni de concurrencia real. No se modificó el código operativo ni se cambiaron datos de Supabase.


## REFUND-05 — El importe y costo de la devolución no se reconcilian contra la línea original

**Severidad: alta. Estado: confirmado por inspección estática el 2026-11-04.**

`recordSaleAdjustment` comprueba que la cantidad no exceda la cantidad pendiente de devolver y que el importe coincida con los valores enviados en `adjustment.items`. Sin embargo, `canApplySaleAdjustmentItems` valida producto/cantidad/línea, no que `unitPrice`, `unitTaxAmount` y `unitCost` sean los valores históricos de la línea original. El costo proporcionado por el cliente se usa después para recalcular el costo promedio del inventario devuelto. La operación actualiza inventario, movimientos, cuentas por cobrar, movimientos de caja y ajustes mediante setters independientes.

**Impacto:** una sesión cliente manipulada puede proponer importes/costos diferentes a los de la factura original; el máximo agregado del reembolso limita parte del importe, pero no valida la valoración por línea. El reembolso pagado también puede generar un movimiento de caja desde el cliente. No hay transacción/actor/clave idempotente de base de datos para la devolución.

**Acción necesaria:** RPC transaccional que lea y bloquee la venta original y sus líneas, derive precio/impuesto/costo de la factura, valide cantidad pendiente, aplique una sola devolución por clave idempotente, registre aprobación y medio real de reembolso, y actualice stock/cartera/caja/auditoría en la misma transacción. No confiar en importes ni costos suministrados por el navegador.

## SUPRET-08 — Despacho y recepción de cambios de proveedor no son atómicos

**Severidad: alta. Estado: confirmado por inspección estática el 2026-11-04.**

`recordSupplierDispatch` valida el estado y stock en memoria, y luego actualiza productos y movimientos por separado. El componente `SupplierReturns` cambia el estado a “Enviado al proveedor” en otra actualización. Para “Cambio recibido”, `resolveSupplierReturn` actualiza productos, movimientos y estado mediante setters independientes. Los bloqueos `useRef` y sets locales solo coordinan esa instancia de la aplicación.

**Impacto:** dos dispositivos pueden despachar la misma devolución o confirmar un cambio simultáneamente, produciendo diferencias entre estado, inventario y movimientos. Las cantidades y costos proceden del snapshot local; no hay restricción única o control de versión en PostgreSQL para estas transiciones.

**Acción necesaria:** una operación de base de datos por transición, con bloqueo de devolución y productos, validación de estado previo, stock/cantidad, actor y fecha del servidor, movimientos inmutables y clave idempotente. La nota de crédito ya tiene cliente preparado para RPC, pero la función no está instalada en la base activa; despacho y cambio recibido aún no tienen RPC.

## INV-04 — Ajustes manuales y eliminación de productos permiten alterar stock sin flujo de aprobación

**Severidad: alta. Estado: confirmado por inspección estática el 2026-11-04.**

`saveProduct` acepta el stock enviado al editar un producto y registra la diferencia como movimiento genérico de ajuste. No exige motivo estructurado, actor, evidencia o aprobación. `deleteProduct` elimina el producto del catálogo y, si tiene stock, crea primero un movimiento de salida; los movimientos históricos quedan referenciando un producto que ya no existe. Estas operaciones modifican productos y movimientos en setters separados.

**Impacto:** el historial no constituye un libro de inventario inmutable y auditable. El valor de stock puede ser reemplazado desde el cliente y la eliminación puede romper referencias de movimientos y documentos históricos.

**Acción necesaria:** RPC de ajuste con cantidad delta, motivo obligatorio, usuario/fecha del servidor, autorización por rol y aprobación separada para ajustes sensibles; preservar productos con referencias históricas mediante archivado lógico, no borrado físico. Restricciones para stock no negativo y transacción que registre saldo anterior/nuevo junto con el movimiento.

## ADMIN-21 — La protección de “último administrador” es susceptible a concurrencia

**Severidad: alta. Estado: confirmado por inspección estática el 2026-11-04.**

En `api/admin-users.ts`, bootstrap consulta la lista de usuarios y después promueve al usuario actual si no encuentra administradores. La actualización de usuarios también enumera usuarios, calcula el número de administradores y después cambia rol/estado de la cuenta. La comprobación y la mutación no son una operación atómica; dos solicitudes concurrentes pueden observar el mismo recuento y ambas continuar.

**Impacto:** el bootstrap concurrente puede crear más de un administrador inicial, o dos cambios administrativos simultáneos pueden dejar el sistema sin una cuenta administradora activa. Las pruebas actuales verifican casos secuenciales y mocks, no concurrencia real.

**Acción necesaria:** serializar cambios de privilegios mediante una función transaccional o mecanismo de exclusión mutua persistente en servidor, volver a contar administradores dentro de la sección crítica y aplicar la modificación en la misma transacción. Registrar actor, objetivo y cambio de privilegios. Probar dos solicitudes concurrentes contra PostgreSQL/Auth de prueba.

**Límite de esta etapa:** hallazgos derivados de inspección estática; no se ejecutaron devoluciones, ajustes, despachos ni cambios de cuentas contra datos reales. No se modificó código operativo ni Supabase.


## AUTHZ-04 — Los cambios de rol y desactivación pueden no reflejarse inmediatamente en sesiones con JWT vigente

**Severidad: alta. Estado: riesgo arquitectónico confirmado por inspección estática el 2026-11-04; latencia efectiva pendiente de medir en entorno aislado.**

La aplicación obtiene `farmi_role`, `farmi_permissions` y `farmi_active` de `user.app_metadata` en el estado de sesión y los usa para decidir la navegación y el módulo visible. Las políticas RLS existentes también consultan los claims del JWT. El cliente Supabase tiene `autoRefreshToken: true`, pero eso no fuerza por sí solo la invalidación inmediata de un access token ya emitido cuando un administrador cambia `app_metadata` o banea/desactiva la cuenta.

**Impacto:** una sesión abierta puede conservar temporalmente permisos anteriores hasta que se renueve el token o se invalide la sesión. El endpoint administrativo comprueba el usuario actual con Auth, pero los guardados directos en `erp_state` se autorizan con el JWT presentado a Postgres. La ventana real depende de la expiración y comportamiento de refresh configurados en Supabase, que no se midieron en esta revisión.

**Acción necesaria:** definir y medir la ventana máxima aceptable de revocación; forzar refresh de sesión al recibir cambios de auth y limpiar estado local al detectar cuenta inactiva; para operaciones sensibles, consultar autorización vigente en servidor/base de datos o usar RPC que valide un estado revocable y no dependa exclusivamente de claims antiguos. Probar desactivación y reducción de permisos mientras hay otra sesión abierta, tanto antes como después del refresh.

**Límite:** no se intentó mantener acceso tras una desactivación real y no se modificó la configuración de expiración de tokens ni la base activa.


## SUPABASE-LIVE-02 — El control de contraseña filtrada de Supabase Auth está desactivado

**Severidad: media. Estado: confirmado por Security Advisor del proyecto activo el 2026-11-04.**

El Security Advisor de Supabase reporta `auth_leaked_password_protection` como WARN: la protección que compara contraseñas nuevas contra credenciales comprometidas (Have I Been Pwned) está deshabilitada.

**Impacto:** usuarios podrían establecer contraseñas que ya aparecen en conjuntos conocidos de credenciales comprometidas. La política de longitud mínima aplicada por la aplicación no detecta por sí sola contraseñas reutilizadas o filtradas.

**Acción necesaria:** activar *Leaked Password Protection* en la configuración de Authentication/Password Security del proyecto Supabase y validar el flujo de alta, invitación, cambio y recuperación de contraseña. No cambiar esta configuración desde el código del ERP: es una opción de Auth del proyecto y debe verificarse después de activarla.

Referencia de remediación: https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection

## SUPABASE-LIVE-03 — No hay historial de migraciones registrado para el proyecto activo

**Severidad: alta para gobernanza de cambios. Estado: confirmado por consulta de metadatos el 2026-11-04.**

La herramienta de migraciones de Supabase devolvió una lista vacía para el proyecto activo, aunque el repositorio contiene scripts SQL de seguridad. Por tanto, no existe evidencia en el historial administrado de migraciones de que las políticas y funciones versionadas en Git se hayan aplicado mediante ese mecanismo.

**Impacto:** el esquema real puede divergir del repositorio; una revisión basada solo en archivos SQL no demuestra qué políticas o funciones están efectivamente instaladas. También complica reproducir, auditar y revertir cambios.

**Acción necesaria:** inventariar el esquema y las políticas actuales mediante metadatos de solo lectura y reconciliarlos con migraciones versionadas. No ejecutar una migración de baseline ni marcar migraciones históricas como aplicadas sin comparar el SQL real y acordar una estrategia de recuperación. Mantener sin cambios los datos de negocio.

## AUTHZ-05 — La política propuesta por rol no equivale a autorización por permiso de módulo

**Severidad: crítica. Estado: confirmado por revisión del SQL versionado el 2026-11-04; no se afirma que ese SQL esté aplicado.**

La migración `202611020001_erp_state_role_write_guard.sql` limita INSERT/UPDATE a cuentas activas con roles reconocidos, pero no compara las claves JSONB modificadas con `app_metadata.farmi_permissions`. Su propio comentario indica que no implementa autorización por módulo. Además, un INSERT inicial no tiene OLD.state para comparar y la política propuesta no valida que el snapshot inicial sea una plantilla canónica.

**Impacto:** incluso después de aplicar esa migración, cualquier rol incluido en la lista de escritura podría, sujeto a los grants y políticas efectivos, escribir un snapshot con cambios en módulos ajenos a sus permisos. El primer INSERT requiere un flujo de inicialización separado para no aceptar datos arbitrarios.

**Acción necesaria:** no presentar esta migración como solución completa de permisos. Diseñar y probar una ruta de inicialización controlada, autorización de claves realmente modificadas con lista de permisos confiables, rechazo de claves desconocidas y operaciones transaccionales para dependencias sensibles. Probar en un Postgres aislado antes de aplicar cualquier cambio al proyecto activo.

**Verificación limitada:** la consulta de metadatos de políticas/grants mediante SQL fue bloqueada por controles de la herramienta en esta sesión. No se obtuvo una lectura nueva de las políticas activas; se evita inferir su estado actual a partir del SQL del repositorio.


## AUTHZ-06 — AuthGate permite entrar al ERP cuando falta la marca de cuenta activa

**Severidad: media. Estado: confirmado por inspección estática el 2026-11-04.**

En `src/components/AuthGate.tsx`, la pantalla de bloqueo se activa únicamente cuando `user.app_metadata.farmi_active === false`. Si la marca no existe, tiene un tipo inesperado o no ha sido provisionada, el componente entrega igualmente el usuario a la aplicación. En `src/App.tsx`, una cuenta sin rol reconocido cae a permisos de navegación predeterminados `dashboard` y `configuracion`.

El endpoint `api/admin-users.ts` sí exige `farmi_active === true` para las acciones administrativas normales, pero conserva deliberadamente el camino `status/bootstrap` para la primera configuración. La navegación del cliente no constituye una barrera de autorización y no demuestra que las escrituras de Supabase estén protegidas.

**Impacto:** cuentas autenticadas pero no provisionadas pueden abrir partes de la interfaz de FARMI en lugar de recibir un estado explícito de cuenta pendiente. Esto crea una diferencia entre el criterio de acceso visual y el criterio de autorización del servidor/base de datos. No se ha demostrado que una cuenta sin marca activa pueda escribir datos en la base activa.

**Acción necesaria:** separar el alta inicial en una pantalla de bootstrap aislada y exigir `farmi_active === true` antes de montar el ERP ordinario. Mantener el bootstrap protegido por el token de activación, una sola cuenta administradora y protección persistente contra intentos repetidos. Antes de cambiar AuthGate, probar el primer administrador, invitaciones pendientes, recuperación de contraseña y cuentas existentes; no bloquear el único camino legítimo de inicialización.

**Límite:** no se alteró AuthGate ni se probó una cuenta real sin metadatos; el hallazgo es estático y requiere pruebas aisladas.


## AUTHZ-07 — Estado React de una cuenta puede sobrevivir al cambio de sesión hasta ejecutar el efecto de carga

**Severidad: alta. Estado: confirmado por inspección estática; mitigación de montaje aplicada el 2026-11-04.**

useErpState(userId) inicializa sus colecciones mediante useState y, cuando cambia userId sin desmontar el componente, el estado React existente no se reinicializa. El efecto que detecta accountChanged limpia esas colecciones posteriormente, pero es un useEffect y ocurre después del render que recibe la nueva sesión. src/main.tsx montaba App sin una key asociada al usuario.

**Impacto:** al cambiar de una cuenta autenticada a otra dentro de la misma instancia de la aplicación, podía existir un render transitorio en el que la nueva sesión recibiera componentes con el estado en memoria de la cuenta anterior. El guardado remoto está deshabilitado hasta remoteReady, lo que reduce el riesgo de mezclar escrituras, pero no evita que datos anteriores se presenten brevemente en pantalla.

**Corrección aplicada:** src/main.tsx ahora asigna key={user.id} a App. Un cambio de usuario desmonta la instancia anterior y crea una nueva, reiniciando el estado React y ejecutando las inicializaciones locales bajo el identificador de la nueva cuenta. No cambia datos ni políticas de Supabase.

**Pruebas pendientes:** cambio entre dos cuentas en el mismo navegador; confirmar que la segunda cuenta nunca muestra los datos de la primera, que los datos locales se cargan solo bajo su clave farmi:user:<id>, y que la sincronización espera a cargar el snapshot remoto. La corrección de montaje debe considerarse mitigación hasta completar esa prueba de integración.

## SUPABASE-LIVE-04 — Las políticas RLS activas tratan la marca farmi_active ausente como activa

**Severidad: alta. Estado: confirmado por consulta de solo lectura al catálogo de PostgreSQL el 2026-11-04.**

Las políticas activas erp_state_select_own, erp_state_insert_own y erp_state_update_own aplican coalesce(farmi_active::boolean, true). Por tanto, un claim ausente se interpreta como activo. INSERT y UPDATE también exigen que el rol pertenezca a la lista permitida; SELECT solo comprueba propietario y estado. Los grants actuales para authenticated incluyen SELECT, INSERT y UPDATE; no se observó grant DELETE en el resultado consultado. No se observó una política DELETE para erp_state.

La consulta agregada de auth.users mostró tres cuentas y todas tenían farmi_active=true (dos Administrador y una Ventas) en el momento de la consulta. No se expusieron correos ni identificadores. Este resultado reduce el riesgo inmediato para las cuentas existentes, pero no corrige el valor por defecto inseguro para cuentas futuras o metadata incompleta.

**Impacto:** una cuenta nueva o mal provisionada que tenga un rol de escritura válido pero carezca de farmi_active puede superar la condición de estado en las políticas activas. Esto coincide con la discrepancia identificada en AUTHZ-06 y demuestra que el SQL de la migración propuesta no representa el comportamiento actualmente instalado.

**Acción necesaria:** planificar la transición a coalesce(..., false) solo después de validar el flujo de bootstrap y todas las cuentas existentes. La migración preparada 202611020001_erp_state_role_write_guard.sql usa el criterio estricto, pero no se aplicó en esta auditoría. No modificar grants ni políticas activas hasta tener pruebas de regresión y un plan de reversión.

**Límite:** se consultaron exclusivamente metadatos de políticas, grants y conteos agregados de metadata; no se leyeron ni alteraron snapshots o datos operativos.


## PRIVACY-01 — La caché local de FARMI permanece en el dispositivo después de cerrar sesión

**Severidad: media. Estado: confirmado por inspección estática el 2026-11-04.**

Los snapshots locales se guardan en localStorage bajo claves por usuario (farmi:user:<userId>:...). El cierre de sesión en AuthGate ejecuta supabase.auth.signOut() y limpia el usuario React, pero no elimina ni bloquea las claves locales asociadas a esa cuenta. La separación por userId evita que otra cuenta autenticada cargue esas claves por el flujo normal, pero cualquier persona con acceso al mismo perfil del navegador puede inspeccionar localStorage desde las herramientas del navegador.

**Impacto:** en equipos compartidos o no bloqueados, datos comerciales y personales almacenados en la caché pueden seguir accesibles después de cerrar sesión. Esto es un riesgo de privacidad del dispositivo, distinto de la autorización RLS del servidor.

**Acción necesaria:** definir política para dispositivos compartidos. Preferir no persistir en localStorage información sensible que no sea necesaria; evaluar una caché protegida por sesión con mecanismo de claves adecuado, expiración y bloqueo al cerrar sesión. No borrar automáticamente la caché actual hasta garantizar que todos los cambios estén sincronizados y que no se pierdan datos pendientes. Añadir pruebas de cierre de sesión, cambio de usuario y restauración de conectividad.

**Límite:** no se inspeccionó contenido de cachés de usuarios reales ni se modificó almacenamiento del navegador o datos de Supabase.


## LOGOUT-02 — Cerrar sesión durante el debounce puede descartar cambios aún no sincronizados

**Severidad: alta para integridad de datos. Estado: confirmado por inspección estática el 2026-11-04.**

En `src/hooks/useErpState.ts`, el autosave del snapshot se programa con un retardo de 500 ms. El cleanup del efecto cancela ese temporizador cuando el componente se desmonta. En `src/App.tsx`, el botón «Cerrar sesión» puede ejecutarse mientras el estado de sincronización está en «Sincronizando…» y no espera a que termine un guardado ni comprueba que el último snapshot haya sido confirmado.

Si la persona cierra sesión antes de que venza el debounce, el temporizador puede cancelarse y el snapshot reciente no llega a Supabase. Aunque los efectos de caché local pueden haber persistido partes del estado, al volver a iniciar sesión el hook carga el snapshot remoto y lo aplica sobre el estado inicial; por tanto, la caché local no garantiza recuperar esos cambios pendientes.

**Impacto:** pérdida de cambios recientes al cerrar sesión rápidamente, especialmente en equipos con conexión lenta o cuando se realizan varias modificaciones seguidas. No se observó una escritura cruzada entre cuentas: cada guardado conserva el userId capturado y RLS sigue siendo la barrera de propiedad.

**Acción necesaria (al detectar el hallazgo):** implementar un flujo explícito de salida que distinga entre guardado pendiente, guardado confirmado y error. Esta acción fue implementada posteriormente en el commit `9765f32ae4df56b56549c53786de4b3f467a31c0`; véase la sección de mitigación al final de este informe.

**Límite:** el hallazgo original se confirmó por inspección estática. La implementación reduce el riesgo, pero no se considera cerrada hasta ejecutar las pruebas funcionales enumeradas en la sección de mitigación.


## Cierre de sesión y sincronización — 2026-11-04

### LOGOUT-02 — Mitigación implementada; pruebas funcionales pendientes

**Estado de código:** corregido en el commit `9765f32ae4df56b56549c53786de4b3f467a31c0`.

- `src/hooks/useErpState.ts` expone `flushPendingSave()`: cancela el debounce pendiente, envía el snapshot actual y solo resuelve cuando termina la promesa de guardado.
- `src/services/remoteErpState.ts` serializa `saveErpSnapshot` por usuario mediante `saveQueues`. Por ello, el flush se encola después de cualquier guardado que ya esté en curso en esta pestaña.
- `src/App.tsx` espera el flush antes de llamar a `signOut()`. Si falla, mantiene la sesión y ofrece una salida explícita sin sincronizar.
- El guardado conserva el control optimista de revisión `updated_at`; si otra sesión modificó la fila, el flush falla en vez de sobrescribir silenciosamente la versión más reciente.

**Verificación de despliegue:** el Preview de Vercel asociado al commit está en estado `READY`; el chequeo combinado de GitHub para ese commit reporta `success`. URL de Preview: https://difarmas-bijahjz70-melissaaltva-2389.vercel.app

**Pendiente antes de cerrar el hallazgo:** pruebas funcionales con usuarios de prueba para (1) edición y salida inmediata antes de vencer el debounce, (2) guardado anterior todavía en curso, (3) error de red con sesión retenida, (4) salida explícita sin sincronizar y (5) cambio de cuenta en el mismo navegador. El estado READY demuestra que el build/despliegue terminó, no que estos escenarios se hayan ejecutado.

**Alcance:** no se aplicaron cambios a Supabase, no se alteraron datos ni esquema, y no se promovió la rama a producción.


## Revisión de estado — 2026-11-04 (continuación)

### LOGOUT-02 — Corrección de consistencia documental

Se actualizó el texto histórico del hallazgo para que no contradiga la mitigación posterior. El comportamiento de cierre de sesión sí fue modificado en el commit `9765f32ae4df56b56549c53786de4b3f467a31c0`; la mitigación está desplegada en Preview. Las pruebas de integración continúan pendientes, por lo que el hallazgo permanece abierto hasta verificarlas.

### AUTHZ-03 / WRITE-01 — Confirmación adicional del límite de autorización

La revisión del código de la rama confirma que `useErpState` construye un único `ErpSnapshot` con colecciones de inventario, ventas, compras, finanzas, clientes, configuración y otros dominios. Los efectos de persistencia guardan el snapshot completo; el servicio usa UPDATE sobre `erp_state.state` completo condicionado por propietario y revisión `updated_at`. Los setters y operaciones que `App.tsx` entrega a los componentes siguen siendo funciones del cliente.

**Conclusión:** no existe todavía una frontera de autorización por módulo en el servidor. El control de revisión evita ciertas sobrescrituras concurrentes, pero no evita que una petición autenticada altere campos JSONB de otros módulos. La UI que oculta menús no resuelve este riesgo.

**Decisión de seguridad:** no se añade un chequeo solo en React ni se cambia la policy activa para simular autorización por módulo. Eso sería insuficiente y podría bloquear usuarios o flujos válidos sin detener peticiones directas. La solución requiere una transición coordinada: inventario de permisos por operación, RPC transaccionales para operaciones críticas y una ruta de escritura del snapshot que compare/valide cada dominio modificado con claims confiables; probarla en entorno aislado antes de aplicar cualquier migración.

**Estado:** abierto, severidad alta. No se modificaron datos ni políticas activas de Supabase.


## Matriz preliminar de dominios y rutas de escritura — 2026-11-04

**Propósito:** establecer el contrato funcional que debe respetar la futura autorización del servidor. Esta matriz se deriva de las claves de `ErpSnapshot`, de los permisos de módulo y de las rutas de escritura observadas. No es todavía un mecanismo de autorización y no debe interpretarse como una corrección aplicada.

### Correspondencia inicial entre datos y permisos

| Dominio del snapshot | Permiso funcional mínimo propuesto | Observaciones de integridad |
|---|---|---|
| `customers` | `clientes` | La creación de cliente desde POS/facturación es un efecto auxiliar de la operación; requiere una regla explícita de operación compuesta. |
| `quotes` | `cotizaciones` | Tiene una ruta de persistencia propia además del snapshot general. |
| `suppliers` | `proveedores` | La administración del proveedor debe distinguirse de recibir compras o gestionar devoluciones. |
| `products` | `inventario` | Compra recibida también actualiza productos; no debe rechazarse un cambio legítimo de inventario cuando forma parte de una recepción autorizada. |
| `inventoryMovements` | `inventario` | También se generan movimientos desde ventas, compras y devoluciones. Validar el origen y la operación, no solo el módulo de destino. |
| `sales` | `ventas` o `facturacion_estandar` según canal | El permiso debe corresponder al canal que origina la venta; no asumir que un usuario con uno de ellos puede usar el otro. |
| `purchases`, `purchaseCostHistory` | `compras` | La recepción afecta también inventario y, si es a crédito, cuentas por pagar. |
| `expenses`, `monthlyGoal`, `fixedExpenses`, `cashClosures`, `cashMovements`, `paymentTransactions` | `finanzas` | Cierres y movimientos de caja necesitan además validaciones transaccionales, secuencia y actor; el permiso de módulo por sí solo no basta. |
| `receivables` | `cuentas_cobrar` | Cobros vinculados a ventas requieren una operación atómica que actualice saldo y transacción de pago. |
| `payables` | `cuentas_pagar` | Pagos y aplicación de créditos de proveedor requieren consistencia con compras y notas de crédito. |
| `supplierReturns`, `supplierCredits` | `compras` | La resolución de nota de crédito ya tiene una ruta RPC específica; despacho, recepción y otros cambios aún necesitan transición atómica. |
| `saleAdjustments` | `ventas` más autorización específica para ajuste/reembolso | Requiere verificar factura y líneas originales, cantidades pendientes, valores calculados por servidor y aprobación cuando corresponda. |
| `missingProductRequests` | `inventario` como permiso propietario; origen permitido desde ventas debe definirse | Es una solicitud auxiliar, no debe habilitar cambios directos de catálogo o stock. |
| `settings` | `configuracion` | Los campos fiscales, de facturación y métodos de pago pueden requerir privilegios separados; no confiar en el objeto enviado por navegador. |

### Rutas de escritura que deben quedar cubiertas

1. **Autosave y flush de salida:** `saveErpSnapshot()` → INSERT inicial o UPDATE completo de `erp_state.state`. El flush de cierre usa esta misma ruta. La revisión `updated_at` protege frente a sobrescritura concurrente, no frente a cambios no autorizados dentro del JSON.
2. **Cotizaciones:** `saveQuotesForUser()` → lectura y UPDATE condicional del JSON completo, mezclando la propiedad `quotes` con el resto del estado remoto. Esta ruta debe tener autorización de cotizaciones en el servidor y preservar las demás claves sin aceptar cambios del snapshot alternativo.
3. **Nota de crédito de proveedor:** `resolve_supplier_credit_note` → RPC existente, con resultado estructurado que actualiza devoluciones, cuentas por pagar y créditos. Debe verificarse la definición SQL instalada y su autorización efectiva; la existencia de la llamada desde el cliente no prueba que la función esté correctamente protegida.
4. **Administración de cuentas:** `api/admin-users.ts` usa el cliente administrativo del servidor y debe mantenerse separada de la autorización de datos operativos. La verificación de rol/estado en este endpoint no protege las escrituras directas a `erp_state`.

### Operaciones compuestas: no autorizar solo por clave modificada

- **Venta / facturación:** venta + descuento/ISV calculado + decremento de stock + movimientos de inventario + posible cuenta por cobrar + transacción/caja. La autorización debe validar el canal de origen y confirmar todo en una transacción.
- **Recepción de compra:** compra + incremento de stock/costo promedio + historial de costos + movimientos + cuenta por pagar + aplicación de crédito de proveedor. El total debe calcularse y conciliarse en servidor, no aceptarse como importe independiente del navegador.
- **Cobro / pago:** saldo de cuenta + transacción de pago + movimiento de caja o banco + vínculo al documento original. Debe existir idempotencia para evitar doble aplicación entre dispositivos.
- **Devolución o ajuste de venta:** documento original + cantidades ya ajustadas + valores fiscales/costo + inventario + saldo + reembolso. No confiar en precio, costo, impuestos ni importe de reembolso enviados por cliente.
- **Devolución a proveedor:** documento de compra + cantidades despachadas/recibidas + inventario + nota de crédito/cuenta por pagar. Cada transición debe comprobar el estado previo bajo bloqueo transaccional.

### Criterios de implementación antes de tocar la base activa

- Rechazar claves desconocidas y tipos inválidos; validar estructura y límites del snapshot.
- No aceptar claims de permisos enviados en el cuerpo de la petición. Leer claims firmados y/o estado de autorización confiable en servidor.
- Una actualización parcial debe comparar contra el estado remoto dentro de la misma transacción; no confiar en un diff calculado únicamente en el navegador.
- El camino de primer INSERT debe estar separado y protegido por bootstrap/provisionamiento verificable.
- Las operaciones compuestas sensibles deben migrarse a RPC transaccionales e idempotentes antes de restringir el snapshot general; de otro modo, los efectos secundarios legítimos podrían quedar bloqueados o seguir siendo falsificables.
- Probar matriz de roles y permisos, cuentas sin claims, claims caducados, dos sesiones concurrentes, reintentos de red, datos históricos y migración/rollback en una base aislada.
- Mantener sin cambios las políticas, grants, filas y snapshots del proyecto Supabase activo hasta aprobar esas pruebas.

**Estado:** análisis y contrato preliminar documentados; ninguna barrera nueva de autorización se ha desplegado. AUTHZ-03 / WRITE-01 continúa abierto y de severidad alta.


## Revisión de aprovisionamiento y bloqueo de cuentas incompletas — 2026-11-04

### AUTHZ-06 — AuthGate admite sesiones sin claim activo, pero la aplicación bloquea módulos después de inicializar el estado

**Severidad: media; discrepancia de flujo y superficie de lectura.**

Se verificaron las versiones actuales de `src/components/AuthGate.tsx`, `src/App.tsx`, `src/hooks/useErpState.ts`, `src/components/Settings.tsx` y `api/admin-users.ts`.

- `AuthGate` solo muestra la pantalla de acceso desactivado cuando `farmi_active === false`. Si el claim falta, permite montar el componente raíz.
- `App` ya calcula el estado activo de forma estricta (`farmi_active === true`) y no renderiza módulos operativos si no hay rol válido y claim activo.
- Sin embargo, `useErpState(userId)` se ejecuta al inicio de `App`, antes de la condición que bloquea la vista. Por ello, la sesión incompleta puede iniciar la carga del snapshot local/remoto aunque luego no se muestre ningún módulo.
- La API administrativa también distingue entre estado explícitamente falso y claim ausente en la comprobación inicial, pero exige `farmi_active === true` para operaciones administrativas ordinarias. El endpoint `status` permite consultar si hay bootstrap disponible.

**Riesgo y limitación:** el bloqueo de módulos reduce la exposición en la interfaz, pero no sustituye RLS. La base activa ya fue observada con una condición permisiva para claims ausentes; una sesión autenticada sin claim podría consultar su propia fila mientras esa policy siga vigente. Esto no implica acceso a filas de otros usuarios.

### BOOTSTRAP-01 — El flujo de primera administración puede quedar inaccesible desde la interfaz

**Severidad: media-alta para recuperación/provisionamiento; no es una escalada de privilegios confirmada.**

`api/admin-users.ts` implementa una acción `bootstrap` protegida por un token configurado en servidor y una comprobación global de que no exista ya un administrador. `Settings.tsx` contiene la interfaz para solicitar el estado y mostrar el formulario de activación. Sin embargo, `App.tsx` exige un rol válido, `farmi_active === true` y permiso `configuracion` para renderizar Configuración.

**Consecuencia:** una cuenta sin metadata, con claim activo ausente/falso o sin permiso de configuración puede no alcanzar la pantalla que contiene el bootstrap, aunque la API contemple esa acción. La recuperación puede requerir un administrador existente o intervención operativa fuera de la interfaz.

**Corrección propuesta:** crear una pantalla de aprovisionamiento separada del ERP normal, visible únicamente para una sesión autenticada cuando el endpoint `status` confirma `canBootstrap`. El servidor debe seguir validando token, usuario actual, ausencia de administrador y límite de intentos; nunca exponer el token ni permitir bootstrap si ya existe administrador. Tras completar, refrescar sesión y exigir nuevos claims. No abrir Configuración ni datos operativos a cuentas sin aprovisionar.

### Acciones de verificación pendientes

1. Probar con usuarios de staging: claims completos, claim activo ausente, claim falso, rol ausente y permisos sin `configuracion`.
2. Confirmar que una cuenta no aprovisionada no puede leer `erp_state` una vez endurecida RLS, pero sí puede completar el bootstrap seguro cuando no exista administrador.
3. Probar bootstrap simultáneo desde dos sesiones; el control de “no existe administrador” debe ser atómico para evitar dos primeros administradores concurrentes.
4. Verificar la ruta de recuperación si el token de bootstrap no está configurado o ya existe administrador.

**Estado:** hallazgo documentado; no se modificó AuthGate, App, Settings, API ni metadata de usuarios. No se alteraron policies, grants o datos de Supabase. AUTHZ-06 y BOOTSTRAP-01 permanecen abiertos hasta una solución y pruebas de staging.


## Revisión de concurrencia del bootstrap y controles de intentos — 2026-11-04

### BOOTSTRAP-02 — La exclusión del primer administrador no es atómica

**Severidad: alta para la integridad del aprovisionamiento; no se ha demostrado explotación.**

La inspección de `api/admin-users.ts` confirma que la acción `bootstrap` ejecuta estos pasos separados:

1. Comprueba que el solicitante no sea ya administrador.
2. Valida el secreto `FARMI_ADMIN_BOOTSTRAP_TOKEN`.
3. Enumera las cuentas mediante `auth.admin.listUsers()`.
4. Si no encuentra administradores, promueve al solicitante mediante `auth.admin.updateUserById()`.

La comprobación global y la promoción no están dentro de una transacción ni comparten un bloqueo persistente. Dos solicitudes concurrentes desde cuentas distintas pueden completar el listado antes de que alguna promoción sea visible y ambas intentar convertirse en administradoras. La comprobación secuencial protege el caso normal, pero no demuestra la invariante de un único bootstrap.

**Corrección requerida:** implementar una exclusión atómica persistente en un recurso transaccional de Supabase/Postgres, con clave única o bloqueo de fila, y que la operación de reserva/promoción se resuelva en una sola transacción o en un protocolo recuperable e idempotente. El endpoint debe comprobar el resultado de esa operación antes de actualizar Auth; cualquier reserva huérfana debe tener un procedimiento de recuperación auditado. Un booleano en memoria de una función serverless, un bloqueo de React o una segunda llamada a `listUsers()` no corrigen la carrera entre instancias.

**Restricción actual:** no se aplicó DDL, RPC ni cambios al proyecto Supabase activo. No se implementa un parche parcial en la API porque sin primitiva transaccional persistente no se puede garantizar la exclusión.

### BOOTSTRAP-03 — El estado informativo no confirma que el bootstrap siga disponible

La acción `status` devuelve `canBootstrap` según que el solicitante no sea administrador y exista `FARMI_ADMIN_BOOTSTRAP_TOKEN`. No comprueba si ya existe otro administrador. Por tanto, puede mostrar el formulario a cuentas no administradoras incluso después de que el primer administrador ya haya sido creado. La acción `bootstrap` sí vuelve a comprobar el directorio y rechaza la solicitud si encuentra un administrador; el formulario visible no equivale a autorización.

**Corrección requerida:** derivar el estado de una reserva/bootstrap persistente y transaccional, no de la mera presencia del secreto. La respuesta informativa debe minimizar lo que revela y nunca sustituir la validación de la acción final.

### Límite de intentos

En el código revisado no se encontró un contador persistente ni una limitación distribuida de intentos para la acción `bootstrap`. La comparación del secreto en tiempo constante es positiva, pero por sí sola no limita intentos. No se añade un rate limit en memoria porque las funciones serverless pueden ejecutarse en instancias distintas y reiniciarse.

**Corrección requerida:** limitar intentos por cuenta y ventana temporal con almacenamiento persistente y operación atómica; aplicar pausas/bloqueos progresivos sin permitir que un tercero bloquee permanentemente a la cuenta legítima; registrar intentos sin guardar el secreto ni incluirlo en logs. Mantener el secreto solo en variables de entorno del servidor, con alta entropía y rotación operativa.

### Verificaciones y estado

- Se verificaron las implementaciones actuales de `api/admin-users.ts`, `AuthGate.tsx`, `App.tsx` y `Settings.tsx`, junto con sus SHA de la rama auditada.
- Se buscó cobertura de pruebas específica para bootstrap y rate limit; la búsqueda del repositorio no devolvió pruebas coincidentes. Esto no prueba que no existan pruebas con otros nombres.
- Casos obligatorios en staging: dos cuentas haciendo bootstrap simultáneamente; tres o más solicitudes inválidas desde una y varias instancias; bootstrap cuando ya existe administrador; reintento después de fallo parcial; recuperación tras reserva incompleta; rotación o ausencia del secreto.
- **Estado:** BOOTSTRAP-02 y BOOTSTRAP-03 documentados, sin corrección transaccional aplicada. La carrera no puede declararse resuelta hasta disponer de la primitiva persistente y pasar pruebas concurrentes. Supabase activo, datos, esquema, políticas y producción permanecen sin cambios.


## Revalidación de controles activos de Supabase — 2026-11-04

Se realizó una inspección SQL estrictamente de lectura en el proyecto activo `nreumomoqiwgqbtnhbdy`, además de consultar los Security Advisors. No se ejecutó DDL, DML, cambios de Auth ni modificaciones de configuración.

### SUPABASE-LIVE-04 — Confirmación de policies permisivas para claims ausentes

La consulta actual de `pg_policies` confirmó:

- `erp_state_select_own`: exige que `auth.uid() = user_id`, pero considera activo un claim ausente mediante `COALESCE(farmi_active, true)`.
- `erp_state_insert_own` y `erp_state_update_own`: aplican la misma aceptación del claim ausente y además requieren uno de los roles operativos permitidos.
- La tabla tiene RLS habilitado, pero no forzado.
- El rol `authenticated` tiene privilegios SQL de SELECT, INSERT y UPDATE; el control de filas depende de las policies.

**Impacto confirmado:** una sesión autenticada propietaria de su fila cuyo JWT no incluya `farmi_active` puede superar la condición de activo en SELECT. INSERT/UPDATE también podrían superar el chequeo de activo si, además, el JWT conserva uno de los roles admitidos. Esto no elimina el filtro de propietario y no demuestra acceso a filas ajenas.

**Estado:** riesgo activo, no corregido. La policy estricta con `COALESCE(..., false)` sigue sin aplicarse. Antes de endurecerla deben probarse el aprovisionamiento inicial, las cuentas existentes, las sesiones antiguas y el proceso de recuperación en staging.

### SUPABASE-LIVE-05 — Protección contra contraseñas comprometidas deshabilitada

El Security Advisor de Supabase devolvió el aviso `auth_leaked_password_protection` (WARN): la protección que compara contraseñas contra credenciales comprometidas conocidas está deshabilitada.

**Corrección recomendada:** habilitar la protección contra contraseñas filtradas en la configuración de Auth del proyecto y verificar el comportamiento de creación/cambio de contraseña en staging. Esta configuración puede depender del plan y de la disponibilidad de la función; no debe contratarse un servicio adicional ni cambiarse el plan sin autorización.

**Estado:** hallazgo verificado y pendiente de configuración. No se cambió la configuración de Auth ni se intentó modificar contraseñas.

### Verificación de grants y alcance

La consulta de catálogo confirmó SELECT/INSERT/UPDATE concedidos a `authenticated` sobre `public.erp_state`. Esto es coherente con el diseño actual de acceso mediado por RLS, pero hace especialmente importante que las policies sean estrictas. No se encontró en los esquemas consultados una función con nombre relacionado con bootstrap, administración o `erp_state` que proporcione una primitiva transaccional para resolver la carrera del primer administrador.

**Límite de la comprobación:** la búsqueda de funciones se restringió a nombres relacionados en los esquemas `public` y `private`; no constituye una auditoría de todas las funciones ni de todos los objetos del proyecto.

**Estado general:** SUPABASE-LIVE-04 y SUPABASE-LIVE-05 continúan abiertos. No se alteraron filas, snapshots, tablas, policies, grants, funciones, Auth ni producción.
