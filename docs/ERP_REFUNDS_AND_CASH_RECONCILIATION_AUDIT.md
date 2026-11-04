# Auditoría de devoluciones y conciliación de caja

Rama: `security/erp-state-permission-matrix`

Alcance: revisión estática de `src/components/POS.tsx`, `src/components/Finance.tsx`, `src/services/financeService.ts`, `src/hooks/useErpState.ts` y `src/domain/types.ts`.

No se modificó lógica financiera, no se ejecutaron migraciones, no se modificaron datos de Supabase y no se desplegó a producción.

## Hallazgos

### 1. Reembolso clasificado según el pago original, no según el medio real del reembolso
Severidad: alta para la conciliación de caja.

El POS construye `SaleAdjustmentRecord.paymentMethod` copiando `selectedSale.payment`. Después, `recordSaleAdjustment` crea una salida de caja cuando ese valor contiene «efectivo». No existe en el registro del ajuste un campo separado que identifique cómo se entregó el reembolso.

Consecuencia: una venta originalmente pagada en efectivo que se reembolsa por transferencia, crédito a favor u otro medio puede reducir indebidamente el efectivo físico. También puede registrarse una salida aunque el reembolso no se haya pagado todavía.

Corrección recomendada: separar `originalPaymentMethod` de `refundPaymentMethod` y del estado de liquidación del reembolso. Solo generar movimiento de caja cuando el reembolso efectivo se confirme; transferencia debe afectar banco, y un saldo a favor debe quedar como pasivo/crédito del cliente. Requiere definir el flujo funcional antes de cambiar datos históricos.

### 2. Métodos de pago configurables no se clasifican consistentemente en reportes de caja
Severidad: media.

El POS interpreta el método mediante `paymentMethods.kind === 'cash'`, por lo que permite métodos de efectivo con nombres personalizados. En cambio, `cashSales` en `financeService.ts` y el cálculo diario `daySales` en `Finance.tsx` cuentan únicamente ventas cuyo texto sea exactamente `Efectivo`.

Consecuencia: si se renombra el método o se crea otro método con tipo «cash», el POS lo trata como efectivo, pero el flujo y cierre de caja pueden omitir esas ventas.

Corrección recomendada: persistir el tipo/categoría estable del método en cada venta (no depender solo del nombre visible) y utilizar ese valor en resumen, flujo, cierre y reportes. Antes de migrar, definir compatibilidad para ventas históricas que solo guardan el nombre.

### 3. La operación de ajuste puede duplicar efectos si se invoca concurrentemente
Severidad: alta; pendiente de corrección.

`recordSaleAdjustment` valida el ID y las cantidades contra el estado capturado, pero no mantiene un bloqueo interno permanente mientras se aplican los setters. El bloqueo del POS es local a la interfaz y no protege otras rutas ni llamadas simultáneas al hook. Dos invocaciones con el mismo estado pueden superar la validación y agregar dos movimientos de inventario/caja.

Corrección recomendada: idempotencia en la capa de dominio con reserva atómica por ajuste/venta y, a largo plazo, operación transaccional en servidor con clave de idempotencia. Un Set local puede reducir dobles clics, pero no sustituye una garantía de servidor.

### 4. Resolución de devolución a proveedor libera el bloqueo al salir de la función
Severidad: alta; pendiente de corrección.

`resolveSupplierReturn` elimina el ID del Set en `finally`. La protección solo cubre llamadas simultáneas mientras la primera función sigue ejecutándose; no impide repetir una resolución cuando el estado React aún conserva el estado anterior. En «Cambio recibido» esto puede duplicar existencias y movimientos.

Corrección recomendada: reservar la resolución por ID hasta confirmar el nuevo estado y usar idempotencia transaccional en servidor. No se aplicó ningún cambio en esta revisión.

## Controles que sí se observaron

- El cierre de caja tiene un bloqueo local contra doble envío y bloquea un segundo cierre del mismo día.
- Cobros y pagos a proveedores validan que el importe sea positivo y no exceda el saldo.
- Los cobros y pagos individuales se registran en `paymentTransactions`, y el cálculo diario intenta separar transacciones nuevas de saldos históricos no desglosados.
- Los movimientos de categoría «Banco» se excluyen del cálculo de efectivo físico.
- El cálculo de efectivo esperado considera ventas, cobros, entradas/salidas, gastos y pagos a proveedores.

## Limitaciones

Esta es una auditoría estática del código de la rama indicada. No prueba concurrencia real en navegador, integridad transaccional de Supabase, ni comportamiento con datos históricos reales. Los cuatro hallazgos requieren pruebas automatizadas y, para los cambios financieros, una decisión funcional antes de implementar.

## Próximo paso

Diseñar y probar el modelo de reembolso con medio de devolución independiente, y persistir el tipo estable del método de pago. Después reforzar idempotencia de ajustes y devoluciones de proveedor. Mantener los cambios aislados y no ejecutar migraciones ni despliegues productivos sin autorización.


### 5. El estado «Pagado» del reembolso lo declara el operador y no exige evidencia ni conciliación

Severidad: alta para control financiero. Confirmado por revisión estática del flujo vigente el 2026-11-04.

En `src/components/POS.tsx`, el formulario permite seleccionar `refundStatus` como `Pendiente`, `Pagado` o `Aplicado a cuenta`. El objeto `SaleAdjustmentRecord` se construye en el navegador con ese estado y el método elegido. En `src/hooks/useErpState.ts`, `recordSaleAdjustment` confía en el estado recibido: si es `Pagado` y hay importe excedente tras reducir el saldo de la cuenta por cobrar, registra una salida en `cashMovements`. No solicita referencia bancaria, número de comprobante, confirmación de caja ni aprobación distinta de quien registra la devolución. Para transferencia, crea una salida clasificada como `Banco` dentro de la lista genérica de movimientos de caja, no un asiento conciliable contra una cuenta bancaria.

**Impacto:** una devolución puede quedar marcada como pagada sin evidencia verificable; el reporte puede mostrar una salida bancaria que no está conciliada con el estado de cuenta. El estado declarado no prueba que el cliente recibió el dinero.

**Corrección requerida:** separar solicitud, aprobación y liquidación. La solicitud crea el saldo pendiente por devolver; la liquidación requiere actor, fecha de servidor, método real y referencia documental. Efectivo debe producir movimiento en caja; transferencia debe enlazarse con cuenta y referencia bancaria conciliable; otros medios deben usar su propio flujo. El estado Pagado debe derivarse de la liquidación confirmada, no de una selección libre del formulario.

### 6. Los reembolsos pendientes no tienen un auxiliar de obligaciones por devolver al cliente

Severidad: alta para integridad de cuentas y conciliación. Confirmado por revisión estática el 2026-11-04.

El modelo `SaleAdjustmentRecord` conserva `refundAmount` y `refundStatus`, pero no existe una colección o auxiliar financiero separado de saldos por devolver con vencimiento, beneficiario, liquidaciones parciales, saldo restante y estado conciliado. Al registrar un ajuste de una venta a crédito, `recordSaleAdjustment` reduce el saldo pendiente de la cuenta por cobrar primero y calcula el excedente como `refundAmount`. Si ese excedente queda `Pendiente`, se conserva como atributo del ajuste, pero no aparece en el auxiliar de cuentas por pagar ni en un flujo independiente de pagos al cliente.

**Impacto:** no hay un listado fiable de obligaciones pendientes de reembolso, ni se puede controlar liquidación parcial, antigüedad o conciliación de ese saldo mediante el módulo financiero existente. El campo de estado no sustituye un auxiliar con saldo y movimientos.

**Corrección requerida:** crear un subledger de reembolsos por pagar al cliente enlazado al ajuste original. Debe soportar liquidaciones parciales idempotentes, saldo calculado, fechas, beneficiario, método y evidencia; impedir liquidar más que el saldo y conciliar cada salida con caja o banco. Antes de migrar, clasificar los ajustes históricos sin inventar pagos ni saldos ya liquidados.

**Nota de actualización:** este análisis describe el código vigente inspeccionado. La referencia histórica del hallazgo 1 sobre uso del método de pago original debe leerse junto con el campo actual `refundPaymentMethod`: el flujo actual ya distingue ese método en el registro del ajuste, pero todavía no valida ni concilia la liquidación real.


### 7. El importe, impuesto y costo unitario del ajuste se aceptan desde el cliente sin cotejarlos con la línea original

Severidad: alta para integridad financiera e inventario. Confirmado por inspección estática de `recordSaleAdjustment` en `src/hooks/useErpState.ts` y del constructor del registro en `src/components/POS.tsx` el 2026-11-04.

La función comprueba que `unitPrice`, `unitTaxAmount` y `unitCost` sean finitos y no negativos, que el total informado coincida con la suma de esos importes y que la cantidad no supere la disponible. Sin embargo, no vuelve a derivar esos valores de la línea original de `sales` ni compara precio, impuesto y costo unitario con ella. El POS suele construir el registro usando la información de la venta seleccionada, pero esa validación ocurre en el navegador y no constituye una garantía de integridad.

El valor `unitCost` recibido también se utiliza para calcular el costo de la mercancía reingresada y el nuevo costo promedio ponderado del producto. Por tanto, un ajuste manipulado o construido desde otra ruta puede cambiar el importe reconocido de la devolución y la valoración del inventario sin respetar los datos originales de la factura.

**Corrección requerida:** derivar en una única operación de dominio los importes permitidos desde la línea original identificada por `saleLineId`; para registros históricos sin identificador, resolver la línea mediante una regla determinista y auditable. Rechazar discrepancias de precio, impuesto o costo fuera de tolerancia definida. El servidor debe repetir las validaciones y realizar ajuste, inventario y movimientos financieros en una transacción; no confiar en el cálculo del cliente.

**Pruebas requeridas:** precio unitario alterado; impuesto alterado; costo unitario alterado; línea de otra factura; línea duplicada; línea histórica sin identificador; devolución parcial repetida; y verificación de que un rechazo no cambia existencias, costo promedio, cuenta por cobrar ni caja.


### 8. La capa de dominio permite registrar una anulación parcial

Severidad: alta para integridad documental y financiera. Confirmado por inspección estática de `recordSaleAdjustment` en `src/hooks/useErpState.ts` y del constructor del ajuste en `src/components/POS.tsx` el 2026-11-04.

El formulario POS prepara `adjustmentItems` con todas las cantidades pendientes cuando el tipo no es «Devolución parcial» y bloquea una anulación si ya existen ajustes previos. Sin embargo, la función de dominio `recordSaleAdjustment` no aplica una regla equivalente: para `type === 'Anulación'` solo impide una segunda anulación. La validación de líneas usa `canApplySaleAdjustmentItems`, que permite cualquier subconjunto de cantidades pendientes, y el importe solo se coteja contra la suma de los importes suministrados y el total restante. Por ello, una llamada directa o una ruta alternativa puede registrar un ajuste parcial etiquetado como anulación.

**Impacto:** los reportes y el historial pueden clasificar como anulada una venta que conserva unidades/importe pendientes. La interfaz habitual reduce la exposición, pero no constituye una validación de dominio.

**Corrección requerida:** imponer en la función de dominio que una anulación cubra exactamente todas las cantidades pendientes de todas las líneas originales y el importe total pendiente calculado desde la venta fuente. Rechazar líneas omitidas, cantidades parciales y discrepancias; probar también concurrencia y ventas con ajustes previos. La regla debe repetirse en servidor cuando exista una operación transaccional autorizada.

### 9. La decisión de reingreso al inventario es global y no separa mercancía no apta

Severidad: alta para control de inventario. Confirmado por inspección estática de `src/components/POS.tsx`, `src/hooks/useErpState.ts`, `src/domain/types.ts` e `src/components/Inventory.tsx` el 2026-11-04.

El formulario de devoluciones expone un único checkbox `returnStock` para toda la operación. Ese mismo valor se copia a cada línea del ajuste; no hay selección por artículo para separar unidades aptas, dañadas, abiertas, contaminadas o no vendibles. Si se marca, `recordSaleAdjustment` suma las cantidades al stock general del producto y recalcula el costo promedio. Los movimientos quedan clasificados genéricamente como `Ajuste` con una nota de devolución. El modelo `Product` mantiene lote y vencimiento a nivel del producto, no una recepción/condición independiente por unidad o lote devuelto.

**Impacto:** si una devolución contiene varias líneas y solo algunas unidades están en condiciones de venta, el control actual no permite registrar una disposición diferente por línea. Al reingresar el conjunto, mercancía no apta puede incrementar el stock disponible. Tampoco existe una ubicación o estado de cuarentena separado que la excluya de POS, picking y reportes de disponibilidad. La comprobación de vencimiento en POS usa la fecha del producto, pero no acredita que cada unidad devuelta esté íntegra ni que pertenezca al mismo lote registrado.

**Corrección requerida:** permitir clasificar cada línea/unidad devuelta como «Apta para venta», «Cuarentena» o «No vendible», con motivo, cantidad, lote/vencimiento, actor y evidencia. Solo «Apta para venta» debe aumentar el inventario disponible; cuarentena y no vendible deben mantenerse fuera del stock vendible y requerir liberación o disposición autorizada. Definir compatibilidad para los registros históricos antes de cualquier migración.

**Pruebas requeridas:** devolución mixta con una línea apta y otra dañada; varias unidades de una misma línea con disposiciones distintas; lote vencido; producto con fecha de vencimiento no registrada; confirmación de que cuarentena/no vendible no puede agregarse al POS; y conciliación entre cantidad devuelta, disponible, en cuarentena y descartada.
