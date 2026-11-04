# Auditoría de autorización por módulo y modo de solo lectura

Estado: revisión estática confirmada; no se modificaron cuentas, claims, datos ni permisos.

## PERM-01 — El rol “Solo lectura” no implementa un modo de solo lectura

**Severidad: alta para confidencialidad/integridad operativa del rol; no implica acceso anónimo ni elevación de privilegios.**

### Evidencia en código

1. `src/components/Settings.tsx` define el preset `Solo lectura` con acceso a dashboard, ventas, redes sociales, clientes, cotizaciones, inventario, compras, finanzas, cuentas por cobrar/pagar, reportes, asistente IA y proveedores.
2. `api/admin-users.ts` contiene el mismo preset `ROLE_PERMISSIONS['Solo lectura']`. El backend de administración guarda esos permisos como una lista de módulos, sin un atributo separado de lectura/escritura.
3. `src/App.tsx` calcula `activeAllowed` comprobando `userAccess.active` y `canSee(active)`. No hay comprobación de un permiso de escritura ni una bandera `readOnly`.
4. La aplicación monta los módulos con callbacks de escritura: por ejemplo, POS recibe `onComplete={recordSale}`; Inventario recibe `onNew` y `onEdit`; Finanzas recibe setters para gastos, cierres y movimientos; Compras recibe `onReceive` y setters para proveedores/devoluciones.
5. El snapshot se guarda mediante `saveErpSnapshot` desde `useErpState.ts`, y el permiso por módulo no se transmite a esa función ni constituye una autorización de servidor.

### Impacto

Una cuenta asignada al rol “Solo lectura” puede abrir módulos donde la interfaz presenta acciones de escritura y, por el diseño actual, recibe los callbacks que realizan esas operaciones. El nombre del rol puede inducir al administrador a creer que esa cuenta solo consulta información, cuando el código no aplica esa restricción.

La autorización de Supabase/RLS sigue siendo una capa distinta: este hallazgo no demuestra que una cuenta pueda modificar datos de otro usuario ni que usuarios anónimos puedan escribir. El problema demostrado es que el rol “Solo lectura” no restringe la escritura dentro de los módulos de su propio ERP.

### Corrección recomendada

- Separar permisos de lectura y escritura (por ejemplo, `read` y `write` por módulo), en lugar de usar una sola lista de módulos.
- Para “Solo lectura”, montar componentes en modo consulta: ocultar/deshabilitar altas, edición, eliminación, cobros, pagos, ventas, recepción de compras y cierres.
- No confiar solo en controles de React. Las operaciones de escritura deben pasar por endpoints/RPCs que validen el permiso efectivo en servidor y el tipo de operación.
- Rechazar por defecto permisos ausentes, claims inválidos y operaciones no contempladas.
- Probar con una cuenta de solo lectura que cada acción de escritura sea rechazada, incluyendo solicitudes directas y concurrencia.
- Mantener lectura de reportes y consulta de módulos sin permitir mutaciones.

### Pruebas necesarias antes de corregir

- Crear una cuenta temporal en Preview con rol Solo lectura, sin tocar cuentas reales.
- Verificar por separado acceso de lectura y cada acción de escritura de Ventas/POS, Inventario, Compras, Finanzas, Cuentas por cobrar y Cuentas por pagar.
- Confirmar denegación en servidor, no solo botones ocultos.
- Confirmar que Administrador y roles operativos conservan sus acciones autorizadas.
- No aplicar cambios de claims, RLS, grants o políticas en producción durante estas pruebas.

## Alcance y estado

Revisión estática de `Settings.tsx`, `api/admin-users.ts`, `App.tsx`, `useErpState.ts` y `remoteErpState.ts` en la rama `security/erp-state-permission-matrix`. No se ejecutaron operaciones con usuarios reales, no se modificó código funcional, Supabase, datos, policies, grants ni variables de entorno. No se promovió a producción.

## PERM-02 — El rol Finanzas incluía el módulo operativo de Compras

**Severidad: media para segregación de funciones.**

### Evidencia
- El preset 'Finanzas' en Settings.tsx y ROLE_PERMISSIONS en api/admin-users.ts incluía el módulo 'compras'.
- App.tsx entrega a Purchases operaciones de recepción de compra, alta/edición de productos y actualización de proveedores/devoluciones. Por tanto, una cuenta con ese permiso no se limita a consultar el resumen de compras recibidas desde Finanzas: también puede entrar al flujo operativo de Compras y recibir mercancía.
- Finanzas ya dispone de una vista de consulta de compras recibidas dentro de su módulo financiero; no necesita el módulo operativo completo para consultar esos registros.

### Corrección aplicada en esta rama
- Se retiró 'compras' del preset 'Finanzas' tanto en src/components/Settings.tsx como en api/admin-users.ts.
- Esto corrige los valores predeterminados para nuevas asignaciones y para cambios de rol realizados desde la interfaz.

### Limitación importante
Los permisos personalizados ya guardados en app_metadata.farmi_permissions no se reescriben automáticamente al cambiar el preset del código. No se modificaron cuentas ni claims reales. Un administrador deberá revisar y guardar explícitamente el permiso de las cuentas Finanzas existentes después de validar el Preview.

## Matriz de autorización: estado confirmado

| Rol | Hallazgo confirmado |
| --- | --- |
| Administrador | Acceso amplio esperado; las protecciones de concurrencia ADMIN-03/07 siguen pendientes. |
| Supervisor | Tiene acceso a los módulos operativos y financieros incluidos en su preset; no hay separación general read/write en servidor. |
| Ventas | No tiene Inventario ni Compras en el preset, pero las mutaciones de clientes, ventas y cotizaciones se ejecutan mediante callbacks cliente. |
| Compras | Tiene acceso a Inventario y Compras, incluyendo recepción y edición de productos; coherente con la función operativa, pero no validado por permiso de módulo en servidor. |
| Finanzas | Se corrigió el preset para retirar Compras operativo. Mantiene consultas financieras y CxC/CxP; las operaciones financieras continúan siendo callbacks cliente. |
| Solo lectura | PERM-01 sigue abierto: el preset concede módulos con callbacks de escritura y el modelo de permisos no distingue lectura de escritura. |

La matriz es una revisión estática de las rutas y callbacks. No equivale a pruebas de autorización HTTP ni a una prueba con cuentas de cada rol.

## Bloqueos para una corrección integral

No es seguro afirmar que todos los roles están protegidos mientras:
1. erp_state almacena un snapshot JSONB completo y las policies RLS actuales autorizan por propietario/estado general de cuenta, no por módulo ni por clave JSONB.
2. Las mutaciones de ventas, inventario, compras, clientes, cobros, pagos y caja se realizan principalmente en el navegador y se sincronizan mediante snapshot.
3. El rol Solo lectura no tiene una capacidad independiente de escritura/lectura.
4. Las operaciones de cobro/pago, cierre de caja, recepción de compras, cambio recibido de proveedor y cambios de administrador necesitan transacciones/idempotencia autoritativas en servidor.

La solución completa requiere diseñar y probar endpoints/RPCs con autorización por operación y transacciones, además de un cambio coordinado de RLS/esquema. No se aplicó ninguna migración, policy, grant, cambio de usuario, claim ni dato de Supabase durante esta auditoría.

## PERM-03 — El editor de permisos no mostraba el módulo Cotizaciones

**Severidad: baja; defecto de administración de permisos.**

### Evidencia y corrección
- api/admin-users.ts incluía 'cotizaciones' en MODULES y los presets Ventas/Supervisor/Solo lectura, pero la lista visible de módulos en Settings.tsx no incluía esa opción.
- Esto impedía seleccionar o deseleccionar explícitamente Cotizaciones desde el editor de permisos, aunque el permiso pudiera existir en el claim.
- Se agregó Cotizaciones a la lista visible del editor en Settings.tsx. La corrección no cambia permisos ya guardados de ninguna cuenta.



## ADMIN-11 — La consulta de estado recorre todo el directorio de usuarios

**Severidad: baja; riesgo condicionado de disponibilidad y consumo de cuota.**

### Evidencia
- En `api/admin-users.ts`, la acción `status` llama a `listAllUsers()` y filtra los administradores para calcular `canBootstrap`.
- La autenticación de sesión se valida antes de procesar la acción, pero la acción `status` se atiende antes de exigir `farmi_active === true` y el rol Administrador.
- `listAllUsers()` consulta páginas de 100 usuarios secuencialmente y puede recorrer hasta 10,000 cuentas. El resultado detallado no se devuelve al solicitante; la respuesta solo incluye el estado administrativo de la propia cuenta, `canBootstrap` y su correo.

### Impacto y límites
Una persona con una sesión válida, incluso sin permisos administrativos, puede solicitar repetidamente esta consulta y provocar llamadas administrativas paginadas innecesarias. Esto puede elevar latencia y consumo de cuota de Auth. No se observó exposición de la lista de usuarios ni bypass de autenticación. La severidad depende de límites externos, frecuencia de llamadas y tamaño real del directorio.

### Corrección recomendada
- Evitar enumerar el directorio completo en cada consulta de estado.
- Resolver el estado de bootstrap mediante un mecanismo de control pequeño, protegido y consistente (por ejemplo, un registro único transaccional de instalación/administrador), o cache compartida con invalidación segura.
- Aplicar limitación de frecuencia compartida en servidor/WAF para acciones administrativas, sin depender de memoria local de una instancia.
- Mantener la respuesta mínima y no incluir datos de otros usuarios.

### Estado
Hallazgo de revisión estática. No se cambió el endpoint, no se modificaron cuentas, Auth, datos ni configuración de Supabase. La corrección requiere diseñar un mecanismo autoritativo para detectar el primer administrador sin introducir una condición de carrera en el bootstrap.


## ADMIN-12 — Las cuentas bloqueadas podían contarse como administradores activos

**Severidad: baja; consistencia de recuperación y protección del último administrador.**

### Evidencia
- La función `isAdmin` de `api/admin-users.ts` comprobaba `farmi_active === true` y el rol/claim de administrador, pero no comprobaba `banned_until`.
- La misma API construye el campo `active` de cada usuario considerando también `!user.banned_until`.
- Por tanto, una cuenta con claim administrativo activo pero bloqueada en Supabase podía contarse en el total de administradores, aunque la API la presentara como inactiva.

### Impacto
Una cuenta bloqueada podía impedir innecesariamente el bootstrap de recuperación o afectar las comprobaciones de protección del último administrador. No permitía que esa cuenta bloqueada iniciara sesión ni demuestra elevación de privilegios.

### Corrección aplicada en esta rama
- `isAdmin` ahora exige `farmi_active === true`, ausencia de `banned_until` y claim/rol de Administrador.
- La comprobación queda alineada con el criterio de cuenta activa que ya utiliza la respuesta de usuarios.
- No se modificaron usuarios ni claims existentes.

### Validación pendiente
- Confirmar el build y deployment Preview del commit de corrección.
- Probar en un entorno de pruebas cuentas activas y bloqueadas, incluyendo bootstrap y protección del último administrador. No se hicieron cambios en Supabase ni pruebas con cuentas reales.

## PERM-08 / PERM-09 / PERM-10 — Acciones de escritura accesibles desde módulos asignados a Solo lectura

**Severidad: alta para integridad; hallazgo de autorización en cliente, no una prueba de bypass de RLS.**

### Evidencia directa revisada en el código actual

- `api/admin-users.ts` conserva para `Solo lectura` un preset que incluye `ventas`, `clientes`, `cotizaciones`, `inventario`, `compras`, `finanzas`, `cuentas_cobrar` y `cuentas_pagar`. La función `safePermissions` acepta esos módulos como permisos normales; no existe un atributo separado de lectura y escritura.
- `src/App.tsx` usa `canSee(module)` para decidir navegación y `activeAllowed` para montar la pantalla. Esos controles no clasifican acciones ni restringen callbacks de mutación.
- En Clientes se pasa `setCustomers` y `Customers.tsx` permite crear, editar y activar/desactivar registros mediante ese setter.
- En Cotizaciones se pasa `setQuotes` y `Quotes.tsx` persiste cambios por ese callback.
- En Inventario se permite abrir el modal de alta/edición y `App.tsx` conecta su guardado con `saveProduct`; el componente también ofrece eliminación cuando recibe el callback correspondiente.
- En Compras, `Purchases` recibe setters de proveedores/carrito/devoluciones y callbacks `onReceive`, `onDispatch` y `onResolve`. El flag `canManageSupplierReturns` se deriva de `canSee('compras')`, por lo que Solo lectura también lo satisface.
- En Finanzas, `Finance.tsx` ejecuta escrituras a gastos, CxC, CxP, transacciones, cierres y movimientos de caja mediante setters que `App.tsx` entrega al componente. La cuenta Solo lectura tiene el permiso `finanzas` y los permisos de CxC/CxP.
- En Dashboard, cuando existe `canSee('finanzas')`, `App.tsx` monta `GoalsSettings` con setters de meta y gastos fijos.

### Impacto

Una cuenta configurada como Solo lectura puede abrir pantallas que presentan operaciones de escritura y cuyos componentes reciben callbacks para cambiar el snapshot local. Esto contradice la expectativa del rol. No significa que el usuario pueda alterar directamente Supabase sin superar RLS; la frontera de persistencia actual sigue siendo el problema separado documentado en AUTHZ-01/AUTHZ-02.

### Alcance y límites de esta revisión

Revisión estática de los archivos y SHA actuales de esta rama. No se inició sesión con una cuenta Solo lectura, no se ejecutaron mutaciones contra datos reales y no se intentó modificar Supabase. La evidencia demuestra disponibilidad de controles de escritura en el cliente, no confirma por sí sola que cada cambio sea persistido con éxito bajo la policy real.

### Corrección requerida

1. Definir capacidades explícitas de lectura y escritura por acción, no inferir escritura a partir del acceso al módulo.
2. Mantener la visibilidad de los módulos para Solo lectura, pero renderizar variantes de consulta sin formularios, botones de mutación ni callbacks de escritura.
3. Validar cada mutación en servidor/RPC con sesión, rol, permiso específico, propiedad, reglas de negocio e idempotencia.
4. No considerar el bloqueo visual como autorización. Mientras `erp_state` acepte snapshot completo del cliente bajo una policy general, el aislamiento por acción no queda garantizado.
5. Probar las rutas con cuentas reales de cada rol en staging antes de aplicar cambios de permisos o RLS.

**Estado:** hallazgo documentado; no se modificó código funcional, usuarios, claims, Supabase ni datos comerciales.
## AUTHZ-03 — La autorización de escritura permite reemplazar el snapshot completo sin validar permisos por módulo

**Severidad: crítica para integridad y segregación de funciones; requiere confirmar en staging con cuentas de prueba antes de cualquier cambio.**

### Evidencia de implementación

- `src/services/remoteErpState.ts` ejecuta las operaciones `insert` y `update` de `public.erp_state` directamente desde el cliente Supabase autenticado.
- `saveErpSnapshotNow` envía el objeto `state: snapshot` completo en una sola actualización. El filtro `user_id` y `updated_at` protege la propiedad de la fila y detecta revisiones concurrentes, pero no limita qué propiedades del JSON puede cambiar el usuario.
- `saveQuotesForUserNow` actualiza la clave `quotes` dentro del mismo JSONB, también directamente desde el cliente. No verifica el permiso `cotizaciones` en servidor.
- `src/hooks/useErpState.ts` construye un snapshot que incluye clientes, productos, ventas, compras, proveedores, gastos, cuentas por cobrar/pagar, movimientos, cierres, configuración y otros módulos. Los setters locales pueden cambiar cualquiera de esas colecciones antes del autosave.
- `api/admin-users.ts` filtra `farmi_permissions` para el editor y los claims, pero esa lista no es consultada por `saveErpSnapshotNow` ni por la actualización directa de `saveQuotesForUserNow`.
- La migración `202611020001_erp_state_role_write_guard.sql` que existe en esta rama exige cuenta activa y limita escritura a los roles Administrador, Supervisor, Ventas, Compras y Finanzas. La revisión de migraciones remotas confirmó que esta migración no está aplicada en el proyecto activo.
- La política activa de escritura revisada en Supabase permite esos roles para la fila propia, pero no valida cada módulo o clave del JSONB. Por tanto, el control de rol no equivale a autorización por función. El rol Solo lectura está excluido de escritura en la policy observada; no se afirma que pueda persistir cambios con su sesión normal.

### Impacto

Una cuenta operativa que sí supera la policy de escritura puede enviar un snapshot que cambie datos de módulos que no tiene asignados en su lista de permisos. Por ejemplo, la lista de módulos puede ocultar Compras a Ventas, pero la autorización de fila no comprueba que el cambio del JSONB se limite a ventas/clientes/cotizaciones. La restricción visual de navegación no es una barrera de seguridad para una llamada directa a Supabase.

La revisión de código demuestra que el cliente envía el snapshot completo y que el control de permisos por módulo no participa en la autorización de persistencia. La posibilidad concreta de explotar cada colección depende de la policy efectiva y de los claims de la sesión; no se realizó una escritura de prueba contra datos reales.

### Diferencia entre controles existentes y autorización

- `user_id = auth.uid()` limita la fila al propietario.
- `updated_at` como revisión compare-and-swap ayuda a evitar sobrescrituras concurrentes.
- `farmi_active` y `farmi_role` limitan la elegibilidad general de escritura.
- Ninguno de esos controles valida el permiso de módulo, la acción de negocio, el esquema permitido por rol ni la transición válida de cada registro.

### Corrección necesaria

1. Dejar de aceptar snapshots completos modificables por el navegador como frontera de autorización.
2. Diseñar operaciones servidoras explícitas para cada dominio (por ejemplo, registrar venta, recibir compra, editar producto, registrar cobro/pago y cerrar caja), validando sesión, rol, permiso específico, propiedad y reglas de negocio.
3. Hacer que la base de datos aplique transacciones, idempotencia y control de concurrencia en las operaciones monetarias y de inventario.
4. Para lecturas, conservar consultas por propietario; para escrituras, validar capacidades por operación y no solo por rol.
5. Migrar el almacenamiento monolítico por etapas, con respaldo, reconciliación y pruebas de compatibilidad; no dividir ni transformar datos comerciales en esta auditoría.
6. Crear pruebas negativas de solicitudes directas: Ventas intentando alterar productos/compras/finanzas; Compras intentando alterar ventas/caja; Finanzas intentando recibir compras o modificar inventario; Solo lectura intentando cualquier mutación. Verificar que el rechazo ocurra en servidor y que el snapshot permanezca idéntico.

### Estado y límites

Hallazgo de revisión estática del código y de la configuración RLS observada en modo solo lectura. No se enviaron solicitudes de escritura, no se modificó ninguna policy, grant, tabla, claim, cuenta o dato. La migración de endurecimiento que está en la rama no se aplicó. Esta corrección requiere un plan de migración y pruebas en staging; no es seguro simularla con bloqueos de botones ni desplegarla directamente a producción.