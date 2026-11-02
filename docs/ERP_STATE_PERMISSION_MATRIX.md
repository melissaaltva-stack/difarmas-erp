# Matriz de autorización para el snapshot de FARMI

Estado: diseño en revisión; no es una migración lista para producción.

## Hallazgos confirmados

- `public.erp_state` guarda un único objeto JSONB por `auth.users.id`.
- El cliente carga el objeto y guarda el snapshot completo en cada autosave.
- `saveQuotesForUser` hace una escritura parcial de `quotes`, pero las demás operaciones usan el snapshot completo.
- La aplicación obtiene rol, estado y permisos de `auth.jwt()->'app_metadata'`; la lista `settings.users` es una copia de administración/UI y no debe considerarse fuente confiable de autorización.
- El endpoint `/api/admin-users` administra cuentas y permisos en Supabase.
- Cada usuario autenticado tiene su propia fila. El esquema actual NO implementa un espacio de datos compartido por empresa/equipo. Los permisos no hacen que varias cuentas compartan el inventario o las ventas.
- El control de rol existente permite escrituras por rol y no verifica permisos de módulo.

## Matriz preliminar: clave JSONB → permiso escritor

La tabla refleja las rutas de escritura observadas en `useErpState.ts`. Los permisos de la derecha son alternativas permitidas para esa clave, no una afirmación de que cada pantalla deba mostrarla.

| Clave | Permisos que pueden justificar una escritura | Motivo / dependencia |
|---|---|---|
| `quotes` | `cotizaciones` | Cotizaciones; incluye guardado parcial dedicado. |
| `customers` | `clientes`, `ventas`, `facturacion_estandar` | El POS/factura puede crear o asociar clientes. |
| `products` | `inventario`, `ventas`, `facturacion_estandar`, `compras` | Edición de inventario, salida por venta y recepción/ajuste de compras. |
| `inventoryMovements` | `inventario`, `ventas`, `facturacion_estandar`, `compras`, `proveedores` | Movimientos derivados de ventas, compras, ajustes y devoluciones a proveedor. |
| `sales` | `ventas`, `facturacion_estandar` | Registro, edición y ajuste de ventas/facturas. |
| `saleAdjustments` | `ventas`, `facturacion_estandar` | Devoluciones y anulaciones. |
| `receivables` | `cuentas_cobrar`, `finanzas`, `ventas`, `facturacion_estandar` | Se crean al vender a crédito y se actualizan al cobrar o corregir factura. |
| `purchases` | `compras` | Registro de compras recibidas. |
| `purchaseCostHistory` | `compras` | Histórico de costos por recepción. |
| `suppliers` | `proveedores`, `compras` | Alta/edición de proveedores desde el flujo de compras. |
| `supplierReturns` | `proveedores`, `compras` | Devolución y resolución con proveedor. |
| `payables` | `cuentas_pagar`, `finanzas`, `compras`, `proveedores` | Nacen de compras a crédito y se actualizan al pagar o recibir nota de crédito. |
| `expenses` | `finanzas` | Registro de gastos. |
| `cashClosures` | `finanzas` | Cierres de caja. |
| `cashMovements` | `finanzas`, `ventas` | Movimientos financieros y reembolsos de ajustes de venta. |
| `paymentTransactions` | `finanzas`, `cuentas_cobrar`, `cuentas_pagar` | Debe verificarse cada flujo de pago antes de cerrar la matriz. |
| `monthlyGoal`, `fixedExpenses` | `finanzas` | Parámetros que modifica el panel de metas/gastos. |
| `missingProductRequests` | `ventas`, `inventario` | Solicitudes de producto faltante originadas en el flujo comercial. |
| `settings` | `configuracion` | Datos de empresa, usuarios reflejados, plantillas, facturación y métodos de pago. |

## Reglas que debe cumplir la futura migración

1. Leer exclusivamente los permisos confiables de `app_metadata.farmi_permissions`; nunca confiar en `settings.users`, valores enviados por el navegador ni metadatos editables por el usuario.
2. Comparar las claves realmente modificadas de `OLD.state` y `NEW.state`. Un snapshot completo no debe exigir permisos de todas las claves si sus valores no cambiaron.
3. Rechazar claves nuevas/desconocidas cuando cambien, hasta que se incorporen expresamente a la matriz.
4. Rechazar escrituras si la cuenta está inactiva, el rol no es reconocido, faltan permisos válidos o el rol es `Solo lectura`.
5. No agregar políticas DELETE ni permitir cambiar `user_id`.
6. Mantener intacto el control optimista de `updated_at` del cliente.
7. Validar los cambios compuestos en una sola transacción; una venta/compra no debe quedar parcialmente guardada.
8. Las actualizaciones de `settings` requieren especial cuidado: la configuración de métodos de pago, datos fiscales y administración de usuarios está agrupada en la misma clave JSON.
9. Los permisos son por módulo, pero esta matriz es una autorización de escritura por clave completa. No puede restringir subcampos o registros individuales dentro de arrays JSON. Para permisos finos por acción/registro se necesitaría normalizar datos o exponer RPCs específicas.

## Bloqueo de diseño: primer guardado (INSERT)

El primer guardado inserta el snapshot completo. En una fila inexistente no hay `OLD.state` con el cual comparar. Permitir que cualquier usuario con rol de escritura inserte cualquier snapshot permitiría saltarse la matriz durante el alta inicial; bloquear todos los INSERT puede impedir el primer inicio legítimo de una cuenta nueva.

Antes de activar un trigger se debe resolver esto explícitamente. Alternativas seguras:
- crear la fila inicial desde un proceso confiable del servidor al crear la cuenta; o
- usar una RPC de inicialización que solo permita un estado vacío/plantilla validada y una sola inicialización.

No se debe resolver con una excepción general para cualquier INSERT.

## Casos de prueba requeridos

- Ventas: usuario con `ventas` puede registrar una venta que cambia `sales`, `products`, `inventoryMovements` y, si aplica, `receivables`; no puede cambiar `settings`.
- Facturación: usuario con `facturacion_estandar` puede registrar/editar factura y sus dependencias permitidas.
- Compras: usuario con `compras` puede recibir compra y actualizar productos, costos, inventario y cuentas por pagar.
- Inventario: usuario con `inventario` puede ajustar productos/movimientos; no puede modificar ventas ni configuración.
- Finanzas: puede actualizar gastos/caja y las claves financieras autorizadas; no puede cambiar productos ni configuración.
- Solo lectura: SELECT permitido si activo, INSERT/UPDATE denegados.
- Inactivo, rol ausente/desconocido o permiso ausente: escritura denegada.
- Clave JSON nueva: modificación denegada hasta actualizar matriz.
- Snapshot completo idéntico: no debe considerarse cambio de todas las claves.
- Cotizaciones: escritura parcial conserva el resto del snapshot y se autoriza únicamente con `cotizaciones`.
- Conflicto de revisión: el control `updated_at` sigue impidiendo sobrescrituras concurrentes.
- Primera inicialización: no debe aceptar datos arbitrarios ni bloquear el flujo legítimo.

## Decisión pendiente

No crear ni aplicar aún el trigger de producción. Primero se debe implementar y probar una ruta segura de inicialización, y confirmar las operaciones de `paymentTransactions` y la configuración. También se debe decidir si el objetivo es proteger snapshots privados por usuario o habilitar datos compartidos por equipo; el esquema actual solo soporta lo primero.


## Revisión adicional del endpoint de cuentas y la inicialización

Inspección de `api/admin-users.ts` en la rama de diseño:

- El endpoint valida el token de sesión con `auth.getUser(accessToken)` y exige administrador para crear, invitar o modificar cuentas.
- La clave de servicio de Supabase se lee solo en el servidor (`SUPABASE_SERVICE_ROLE_KEY` o `SUPABASE_SECRET_KEY`); no se debe trasladar al navegador.
- La creación directa asigna `farmi_role`, `farmi_permissions` y `farmi_active` en `app_metadata`.
- La invitación crea primero el usuario y después asigna `app_metadata`. Si falla el segundo paso, el endpoint devuelve error, pero la invitación ya existe; la cuenta debe revisarse y no debe suponerse que quedó lista.
- El endpoint no crea una fila en `erp_state`. Por tanto, no existe hoy una inicialización confiable desde el servidor que resuelva el primer INSERT.
- La aplicación carga el snapshot remoto y, si no existe, el cliente intenta insertar el snapshot local completo. El comentario del hook confirma que esa primera carga puede sembrar datos locales existentes. No es seguro reemplazar ese comportamiento por un snapshot vacío sin una migración explícita: podría ignorar información local válida.

### Decisión técnica sobre INSERT

No se recomienda crear automáticamente una fila vacía en el endpoint de usuarios: el alta de una cuenta no conoce si existe información local legítima que deba migrarse, y una fila vacía haría que el cliente tratara la cuenta como ya inicializada.

Tampoco es suficiente una RPC que acepte cualquier JSON del navegador y compruebe solo que la fila aún no existe. Eso seguiría permitiendo que el primer INSERT incluya datos de módulos no autorizados.

La ruta segura debe separar dos casos:

1. **Cuenta realmente nueva, sin datos que importar:** inicialización desde un estado canónico mínimo, validado en servidor/base de datos y sin permitir que el cliente agregue claves arbitrarias.
2. **Cuenta con datos locales que deben conservarse:** flujo de importación inicial explícito, autenticado y de una sola vez, que valide las claves y dependencias permitidas antes de insertar. Si el snapshot contiene datos de módulos no autorizados, debe detenerse y pedir intervención administrativa; no debe descartar ni copiar esos datos silenciosamente.

Hasta implementar esos dos caminos y probarlos, el INSERT directo desde el navegador no debe considerarse protegido por la matriz.

## Riesgo de granularidad detectado

La matriz de permisos por clave es una primera barrera, pero no equivale a permisos por acción. Por ejemplo, autorizar `products` para que Ventas descuente existencias también permite que una escritura directa modifique otros campos del arreglo de productos, como costo, precio o datos de producto. De igual forma, autorizar `customers` desde Ventas permite modificar el arreglo completo de clientes.

Por ello, esta matriz reduce el acceso entre módulos, pero no constituye aislamiento completo de campos o registros. La solución de mayor seguridad a mediano plazo es mover operaciones sensibles a RPCs específicas (registrar venta, recibir compra, ajustar inventario, cobrar cuenta) o normalizar las tablas por entidad y aplicar RLS por operación. No se debe presentar el trigger JSONB como sustituto de ese diseño.

## Verificaciones adicionales antes de cerrar la matriz

- Confirmar cada llamada que modifica `paymentTransactions` y `missingProductRequests`, y si hay acciones financieras/comerciales que las generan indirectamente.
- Separar `settings` de los datos administrativos de usuarios: la copia `settings.users` no es autoridad y la gestión real ocurre por el endpoint de Auth.
- Revisar las rutas de cobro/pago para no autorizar un módulo de lectura a escribir por una dependencia accidental.
- Asegurar que el rol `Administrador` y su lista completa de permisos se mantengan coherentes entre `api/admin-users.ts`, `Settings.tsx` y las funciones SQL.
