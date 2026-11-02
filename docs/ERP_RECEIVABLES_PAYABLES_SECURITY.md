# Seguridad de creación y modificación de saldos de cuentas

Estado: diseño basado en revisión estática de la rama `security/erp-state-permission-matrix`. No conectado a producción.

## 1. Flujos actuales confirmados

### Cuentas por cobrar
- `recordSale` crea una cuenta por cobrar cuando el método de pago corresponde a crédito.
- `updateStandardInvoice` puede actualizar el total, titular y vencimiento de la cuenta vinculada a una factura estándar existente.
- `Finance.tsx` y `FinancialModules.tsx` registran abonos: incrementan `receivables.paid` y agregan una transacción `Cobro`.
- Las devoluciones/anulaciones de venta pueden reducir el saldo pendiente de una cuenta por cobrar.

### Cuentas por pagar
- `receivePurchase` crea una cuenta por pagar cuando la compra se recibe a crédito.
- `Finance.tsx` y `FinancialModules.tsx` registran pagos: incrementan `payables.paid` y agregan una transacción `Pago proveedor`.
- `resolveSupplierReturn`, al recibir una nota de crédito del proveedor, puede reducir el total de una cuenta por pagar sin reducir el importe ya pagado.

## 2. Matriz de operaciones recomendada

| Operación | Permiso funcional | Efecto permitido |
|---|---|---|
| Crear cuenta por cobrar desde venta/POS | `ventas` | Crear cuenta vinculada a la venta; no cambiar abonos previos |
| Crear/actualizar cuenta por cobrar desde factura | `facturacion_estandar` | Crear o ajustar la cuenta vinculada a esa factura, respetando pagos ya aplicados |
| Registrar abono de cliente | `cuentas_cobrar` | Incrementar saldo pagado y crear solo una transacción `Cobro` |
| Ajuste por devolución de venta | `ventas` o permiso explícito de devoluciones | Reducir solo saldo pendiente vinculado a la venta; no borrar cobros |
| Crear cuenta por pagar desde compra | `compras` | Crear obligación vinculada a compra; no cambiar pagos previos |
| Registrar pago a proveedor | `cuentas_pagar` | Incrementar saldo pagado y crear solo una transacción `Pago proveedor` |
| Aplicar nota de crédito de proveedor | `compras`/devoluciones autorizadas | Reducir el saldo total pendiente de la obligación vinculada; no alterar pagos históricos |
| Resumen e historial financiero | permiso de lectura correspondiente | Consultar; nunca modificar por el solo hecho de leer |

El rol Administrador puede realizar estas acciones conforme a su autorización administrativa. El permiso `finanzas` debe definirse explícitamente: si conserva funciones de cobro y pago, debe invocar las mismas operaciones de servidor y no recibir acceso directo a modificar las colecciones completas.

## 3. Validaciones obligatorias en servidor

### Crear cuenta por cobrar
- Verificar permiso de venta/facturación y que la venta/factura exista y pertenezca al usuario/empresa correspondiente.
- Derivar cliente, total, fecha, vencimiento e identificador de venta desde datos validados en servidor.
- Impedir duplicar una cuenta para la misma venta/factura.
- No aceptar que el cliente envíe un `paid` inicial arbitrario; iniciar en cero salvo migración histórica validada.

### Crear cuenta por pagar
- Verificar permiso de Compras y que la compra exista y esté recibida.
- Derivar proveedor, total, fecha, vencimiento e identificador de compra desde datos validados en servidor.
- Impedir duplicar la obligación para la misma compra.
- No aceptar un `paid` inicial arbitrario; iniciar en cero salvo migración histórica validada.

### Modificar una cuenta existente
- Validar la acción concreta, no solo el permiso de la colección.
- No permitir cambiar libremente `id`, vínculo de origen, titular, importe original ni historial de pagos.
- Cobros/pagos deben ser movimientos inmutables; las correcciones deben ser operaciones de reverso/ajuste auditables, no edición silenciosa de registros anteriores.
- Bloquear sobrepagos y carreras concurrentes mediante bloqueo transaccional y validación del saldo en PostgreSQL.

## 4. Arquitectura objetivo

Las colecciones `receivables`, `payables` y `paymentTransactions` dentro del snapshot JSONB no permiten aplicar políticas RLS por fila ni diferenciar con garantías la acción que originó cada cambio.

La arquitectura objetivo es:
- tablas normalizadas para cuentas por cobrar, cuentas por pagar, cobros y pagos;
- claves foráneas a ventas/facturas y compras;
- restricciones de unicidad para impedir cuentas duplicadas por documento de origen;
- RLS para lectura y acceso por propietario/empresa;
- funciones transaccionales independientes para crear cuenta, registrar cobro, registrar pago, ajustar por devolución y revertir;
- permisos comprobados dentro de cada función con metadatos confiables;
- idempotencia para reintentos y restricciones para impedir doble aplicación;
- bitácora de actor, fecha, acción, motivo y referencias de origen.

No se recomienda una función genérica que reciba un snapshot completo ni un JSON arbitrario con el nuevo saldo.

## 5. Compatibilidad y migración de datos

Antes de migrar:
1. Obtener respaldo consistente del snapshot actual.
2. Contar cuentas por cobrar, cuentas por pagar y transacciones por tipo.
3. Identificar cuentas sin venta/compra de origen o con referencias ambiguas.
4. Conciliar `paid`, total, saldo y suma de movimientos históricos. Registrar diferencias; no inventar transacciones faltantes.
5. Migrar en modo verificable, conservar IDs/referencias y generar reporte de filas rechazadas.
6. Comparar conteos y totales antes/después.
7. Mantener el snapshot original intacto hasta aprobación y pruebas completas.
8. Definir ventana de transición para evitar escrituras simultáneas en JSONB y tablas normalizadas.

No se debe activar una migración destructiva ni cambiar el origen de lectura/escritura en producción como parte de esta auditoría.

## 6. Pruebas de autorización y regresión

- Ventas puede crear una cuenta por cobrar nueva asociada a una venta a crédito, pero no editar abonos anteriores.
- Facturación puede ajustar solo la cuenta asociada a la factura que modifica y nunca reducir el total por debajo de lo ya pagado.
- Compras puede crear una cuenta por pagar al recibir una compra a crédito, pero no cambiar pagos históricos.
- Cuentas por cobrar no puede crear cuentas arbitrarias ni tocar obligaciones de proveedores.
- Cuentas por pagar no puede crear cuentas arbitrarias ni tocar saldos de clientes.
- La nota de crédito solo modifica la obligación asociada a la compra/proveedor correctos y no puede reducirla por debajo de lo pagado.
- Devoluciones de venta no alteran transacciones de cobro ni generan reembolsos no ejecutados.
- Permisos ausentes, rol desconocido, cuenta inactiva o metadatos incompletos deben denegar escrituras.
- Repetición de solicitud, concurrencia, saldo cero, sobrepago, referencias cruzadas y documentos duplicados deben probarse.
- Los informes históricos deben conciliarse con los datos anteriores y posteriores a la migración.

## 7. Estado de ejecución

La revisión de código y este diseño son estáticos. No se han ejecutado pruebas automatizadas ni SQL, no se ha creado una migración, no se han normalizado tablas y no se ha cambiado el flujo de persistencia. La rama de producción y los datos existentes permanecen fuera de este trabajo.
