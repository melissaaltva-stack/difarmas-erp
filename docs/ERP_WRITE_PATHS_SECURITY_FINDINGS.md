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

**Verificación pendiente:** CI/build/tests y Preview para el commit nuevo. No se modificó Supabase ni producción.


### LOCAL-05 — Caché del ERP separada por cuenta

**Estado: corregido en código — commit `f44cc38ad1f1a3dd62db63d035f7b88f42d91529`.**

Las escrituras locales de los datos operativos del ERP ahora usan claves namespaced por usuario autenticado (`farmi:user:<userId>:<clave>`). La lectura prioriza esa clave separada. Las claves globales antiguas solo se leen si el marcador `difarmas_owner_user_id` coincide exactamente con el usuario.

Al cambiar de cuenta, si existe un propietario anterior identificado, el sistema copia las claves heredadas a su espacio individual antes de cambiar de usuario. La copia no elimina ni modifica las claves originales. Si el marcador no existe, se mantiene el bloqueo de recuperación descrito en SESSION-03 / LOCAL-04; no se asignan datos heredados por suposición.

**Alcance y límite:** esto reduce la mezcla accidental entre cuentas dentro de la aplicación. No cifra los datos del navegador ni sustituye la autorización del servidor; un usuario con acceso al mismo perfil del navegador o herramientas de desarrollo aún puede inspeccionar el almacenamiento local. Los datos remotos y las reglas RLS siguen siendo la frontera de seguridad principal.

**Verificación pendiente:** CI/build/tests y Preview para el commit nuevo. No se modificó Supabase ni producción.
