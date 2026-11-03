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
