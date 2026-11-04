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