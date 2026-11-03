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

