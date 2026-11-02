# Auditoría complementaria: consistencia de anulaciones, devoluciones y reportes

Fecha: 2026-11-02  
Rama: `security/erp-state-permission-matrix`  
Alcance: revisión estática de `src/hooks/useErpState.ts`, `src/components/POS.tsx`, `src/components/Finance.tsx`, `src/components/ManagementSuite.tsx`, `src/domain/types.ts` y `src/services/financeService.ts`.

## Hallazgos

### 1. Reportes comerciales no descuentan devoluciones ni anulaciones — Alto
Los cálculos revisados consumen `sales` directamente y no incorporan `saleAdjustments`:
- `ExecutiveDecisionCenter` y `ExecutiveAlerts`: suman `SaleRecord.total` y `SaleRecord.profit`.
- `IntelligentForecast` y `TrendDetector`: agregan ingresos y utilidad de ventas originales por mes.
- `ProductProfitability`: suma unidades, ingresos, costo y utilidad de líneas originales.
- `CustomerRecoveryEngine` y `SalesOpportunityEngine`: cuentan compras/unidades sin restar unidades devueltas.
- El historial de ventas de `Finance.tsx` presenta el total y utilidad originales sin mostrar el ajuste asociado.

Efecto: tras una devolución parcial o anulación, los indicadores pueden seguir mostrando ventas, utilidad y unidades como si no hubiera ocurrido el ajuste. Los ajustes se guardan aparte y no se observa una proyección neta común para reportes. Esto es un riesgo de información gerencial; no significa que el registro original se haya borrado.

Recomendación: mantener la venta original como documento histórico y calcular métricas netas mediante una función central que aplique los ajustes por venta, línea, fecha y tipo. Exponer por separado bruto, devoluciones/anulaciones y neto. No reescribir ventas históricas.

### 2. Reembolso efectivo se deriva del pago original, no del medio real de devolución — Alto
En POS, `submitAdjustment` construye `paymentMethod` con `selectedSale.payment`. En `recordSaleAdjustment`, cualquier valor que contenga “efectivo” genera automáticamente una salida de caja por el importe total del ajuste.

Efecto: una venta cobrada originalmente en efectivo que se devuelve por transferencia, crédito a favor u otro medio puede registrar una salida de efectivo físico aunque no haya salido efectivo. También se crea la salida al registrar el ajuste, sin un estado que confirme que el reembolso se liquidó.

Recomendación: separar el medio de pago original del medio de devolución y el estado de liquidación. Registrar movimiento de caja/banco únicamente al confirmar el pago efectivo correspondiente. Los saldos a favor deben tener un registro separado.

### 3. Exceso de devolución sobre el saldo pendiente de una venta a crédito — Alto
`recordSaleAdjustment` reduce el saldo pendiente de la cuenta por cobrar solo hasta `total - paid`. Si el ajuste excede ese saldo, la parte ya pagada no se refleja como reembolso ni como crédito a favor; el importe de ajuste queda registrado por separado.

Efecto: el sistema puede dejar la cuenta por cobrar en cero, pero no registra automáticamente qué ocurrió con la parte ya cobrada. La observación en el código indica que el reembolso requiere un pago real por separado, pero no existe en el tipo `SaleAdjustmentRecord` un vínculo/estado que concilie ese pago con el ajuste.

Recomendación: dividir el ajuste entre reducción de saldo pendiente y monto a reembolsar/abonar a favor; exigir que la segunda parte tenga liquidación explícita y referencia a la transacción.

### 4. Validación de anulaciones y devoluciones parciales depende parcialmente del cliente — Media
POS impide seleccionar “Anulación” cuando ya existen ajustes para la venta. La función de dominio valida cantidades e importes y evita una segunda anulación, pero no se observó una reserva idempotente por venta dentro de `recordSaleAdjustment`; el bloqueo `adjustmentSubmissionLocks` vive en el componente POS y se limpia cuando cambia el arreglo de ajustes.

Efecto: dos clientes/sesiones o llamadas concurrentes con el mismo snapshot pueden intentar registrar el mismo ajuste. La comprobación contra el estado capturado no constituye una garantía transaccional entre sesiones.

Recomendación: idempotency key única y restricción/operación transaccional en servidor por venta; comprobar cantidades disponibles dentro de la misma transacción.

### 5. Existencias devueltas sí generan movimiento de inventario, pero no se enlaza con una conciliación financiera completa — Media
Cuando `returnToStock` es verdadero, el dominio aumenta el stock y crea un `InventoryMovement` de tipo `Ajuste`, con `referenceId` igual al ID del ajuste. La cantidad se valida contra lo vendido y previamente ajustado.

Límite: el retorno de existencias no está vinculado a un lote/condición del producto y el ajuste financiero se procesa por separado. La revisión estática no confirma la idoneidad física/comercial de los productos devueltos.

Recomendación: conservar la referencia cruzada y agregar estado de inspección/condición antes de devolver unidades vendibles al inventario, especialmente en productos con lote o vencimiento.

## Controles positivos observados
- El original de la venta se conserva; el ajuste se agrega en una colección separada.
- El dominio valida que los importes coincidan con cantidad × precio y que las cantidades ajustadas no superen las vendidas.
- Los productos que se reponen al inventario generan movimiento con referencia al ajuste.
- En ventas a crédito, el saldo pendiente se reduce primero y no se reduce el importe ya pagado automáticamente.

## Límites de esta revisión
- Es una auditoría estática de código; no se ejecutaron escenarios de caja ni pruebas concurrentes contra Supabase.
- No se modificó código, datos, esquema ni migraciones.
- No se ejecutó despliegue ni merge.
- Los registros históricos no deben recalcularse ni alterarse sin una estrategia de compatibilidad, conciliación y respaldo.

## Prioridad recomendada
1. Corregir la liquidación de reembolsos (medio real y estado confirmado).
2. Centralizar cálculo neto de ventas/utilidad/unidades para todos los reportes.
3. Añadir conciliación explícita para la parte ya pagada de ventas a crédito.
4. Añadir idempotencia transaccional para ajustes.
5. Añadir control de inspección del producto devuelto antes de reincorporarlo al stock.
