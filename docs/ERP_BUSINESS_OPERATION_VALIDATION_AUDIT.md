# Auditoría de validación de operaciones de negocio — FARMI

Rama: `security/erp-state-permission-matrix`  
Archivos revisados: `src/hooks/useErpState.ts`, `src/services/inventoryService.ts`, `src/services/salesService.ts`, `src/services/purchaseService.ts`, `src/components/FinancialModules.tsx` y `src/domain/types.ts`.  
Revisión estática. No se ejecutaron operaciones reales, pruebas automatizadas ni cambios de datos.

## Hallazgo DOMAIN-01 — La venta confía en precios y costos enviados por el carrito

**Severidad: alta para integridad contable.**

`recordSale` valida cantidades positivas, stock disponible y algunos importes indirectamente. Pero recibe `CartItem[]` y `buildSaleRecord` utiliza directamente `item.price` e `item.cost` del carrito para calcular total, costo y utilidad. `applySaleToInventory` también valida esos valores, pero no los compara con el producto canónico del inventario ni con la lista de precios autorizada.

**Impacto:** una llamada que altere el objeto de carrito podría guardar una venta con precio o costo distinto al registrado en el producto, afectando ingresos, margen e historial.

**Corrección:** reconstruir cada línea en una operación de servidor a partir de IDs de producto, cantidad, lista de precios y descuentos autorizados. No aceptar costo ni precio calculado por el navegador como dato confiable.

## Hallazgo DOMAIN-02 — Las facturas estándar aceptan importes de línea suministrados por el cliente

**Severidad: alta para integridad de facturación.**

En `recordSale`, cuando se recibe `invoiceDetails`, se copian campos como `netTotal`, `lineTotal`, `discountAmount`, `taxAmount`, `discountPercent` y `taxPercent` de las líneas recibidas. El total de factura se calcula sumando `lineTotal` recibido, sin recalcular en esta función los importes a partir de cantidades, precios y tasas autorizadas.

**Impacto:** valores alterados en el cliente pueden producir diferencias entre productos, descuentos, impuesto, total y utilidad.

**Corrección:** validar que cada línea corresponda exactamente a un producto vendido, que no haya líneas duplicadas u omitidas, y recalcular todos los importes en servidor/base de datos con reglas fiscales configuradas y redondeo uniforme.

## Hallazgo DOMAIN-03 — El total de compra puede diferir del detalle recibido

**Severidad: alta para integridad financiera.**

`receivePurchase` calcula el total del detalle, pero acepta `enteredTotal` si es un número finito y no negativo. Ese valor reemplaza el total del registro y de la cuenta por pagar, mientras que el costo promedio y el historial de costos se calculan a partir de `qty × unitCost` de cada artículo.

**Impacto:** la obligación financiera puede no coincidir con el valor de inventario recibido ni con el historial de costo.

**Corrección:** definir explícitamente cómo se distribuyen descuentos, flete, impuestos y otros cargos. Reconciliar el total de factura con el detalle y guardar los ajustes desglosados; no aceptar un total arbitrario desconectado de las líneas.

## Hallazgo DOMAIN-04 — El método de pago de compra no se valida como conjunto permitido

**Severidad: media.**

`receivePurchase` recibe `paymentMethod:string` y lo convierte mediante una aserción de tipo a `Efectivo | Transferencia | Crédito`. La aserción TypeScript no valida el valor en tiempo de ejecución. Solo el texto exacto `Crédito` crea una cuenta por pagar y activa la fecha de vencimiento.

**Impacto:** valores no reconocidos pueden guardarse como método de pago, pero no generar la obligación esperada o quedar inconsistentes con reportes.

**Corrección:** validar contra métodos activos configurados y su tipo, exigir fecha de vencimiento para crédito y rechazar valores desconocidos.

## Hallazgo DOMAIN-05 — El borrado de producto elimina el registro sin comprobar referencias históricas

**Severidad: media para trazabilidad.**

`deleteProduct` elimina el producto de `products` directamente. Los registros históricos guardan copias de algunos datos, pero movimientos, devoluciones y solicitudes pueden depender del identificador del producto.

**Impacto:** se pueden perder relaciones útiles para auditoría, devoluciones o análisis de inventario.

**Corrección:** archivar/desactivar productos en lugar de eliminarlos físicamente. Permitir borrado solo si no existen referencias y queda registro de auditoría.

## Hallazgo DOMAIN-06 — Cobros y pagos se ejecutan mediante setters de estado del cliente

**Severidad: alta para integridad financiera.**

`ReceivablesModule` y `PayablesModule` actualizan saldos y agregan movimientos a `paymentTransactions` desde el navegador, y reciben setters de estado directamente. Las validaciones de importe son útiles para la interfaz, pero no son una barrera confiable si la escritura final es el snapshot completo.

**Impacto:** no existe una operación atómica en servidor que garantice que el abono, el saldo y el movimiento de pago se creen juntos una sola vez. Los IDs generados en el cliente y los bloqueos con `useRef` no garantizan idempotencia entre dispositivos.

**Corrección:** RPC transaccionales separadas para cobrar y pagar, con clave de idempotencia, cuenta existente, importe positivo, saldo calculado en servidor, método permitido y asiento inmutable. Reversar mediante movimiento compensatorio, no editando el historial.

## Hallazgo DOMAIN-07 — Validación de cantidad permite fracciones en ventas y compras

**Severidad: media, depende de las unidades admitidas.**

Los servicios validan que `qty` sea finita y mayor que cero, pero no exigen entero. En una farmacia puede haber presentaciones fraccionables, pero el sistema no declara aquí una regla de unidad por producto.

**Corrección:** definir unidad de inventario y precisión permitida por producto (unidad, tableta, ml, etc.). Validar la precisión según esa configuración; no imponer enteros globalmente si el negocio admite fracciones.

## Controles positivos observados

- Se rechazan ventas con stock insuficiente.
- Se rechazan compras con cantidades/costos negativos o no finitos.
- La recepción de compra valida vencimiento con al menos seis meses según la regla implementada.
- Se evita duplicar número de factura de proveedor para el mismo proveedor (comparación local del snapshot).
- Los cobros/pagos de interfaz validan importe positivo y que no exceda el saldo mostrado.
- Las devoluciones de proveedor comprueban saldo pendiente y evitan aplicar una nota de crédito superior al saldo abierto.

## Orden recomendado de corrección

1. Operaciones transaccionales server-side para cobros, pagos, ventas y compras.
2. Recalcular precio, costo, impuestos, descuentos y totales a partir de datos canónicos.
3. Validar métodos de pago activos y condiciones de crédito.
4. Sustituir borrado físico por archivado.
5. Definir precisión de unidades de inventario.
6. Probar escenarios de repetición, concurrencia, manipulación de payload y reversos en staging.

**No se modificó el código ni se aplicaron cambios a Supabase.** La corrección debe diseñarse como migración gradual compatible con los datos actuales.
