# Auditoría de cierre — Compras y recepción

Rama: `security/erp-state-permission-matrix`
Fecha: 2026-11-04
Alcance: revisión estática de recepción de compras, cálculo de costos y cuentas por pagar. No se modificó código operativo, esquema, políticas ni datos.

## Hallazgos confirmados

### PUR-01 — Total de factura no conciliado con el detalle
**Severidad: Alta (integridad financiera).**
En `Purchases.tsx`, el total digitado en `invoiceTotal` sustituye el total calculado de líneas + ISV. La recepción solo valida que sea numérico y no negativo; no exige que coincida con el detalle ni registra la diferencia como descuento, flete, recargo u otro concepto. En `useErpState.ts`, ese total se guarda en la compra y puede alimentar la cuenta por pagar, mientras el detalle de productos no queda asociado al registro `PurchaseRecord` (el tipo solo conserva encabezado y total).
**Riesgo:** la factura, los costos de inventario y el saldo del proveedor pueden representar importes distintos sin explicación ni conciliación.
**Cierre requerido:** guardar detalle y desglose de diferencias; validar subtotal, ISV, descuentos y cargos contra factura; exigir motivo/documento para diferencias.

### PUR-02 — Costo promedio excluye el ISV de compra
**Severidad: Alta (valoración de inventario).**
`Purchases.tsx` calcula ISV por línea, pero `applyPurchaseToInventory` calcula el costo promedio ponderado usando únicamente `item.unitCost`. El ISV y cualquier diferencia entre el total digitado y el detalle no se distribuyen al costo del producto.
**Riesgo:** el costo promedio puede quedar por debajo del costo real de adquisición cuando el impuesto u otros costos deban formar parte del costo; también puede diferir del criterio contable aplicable.
**Cierre requerido:** definir con Finanzas el tratamiento fiscal/contable (ISV recuperable o no, flete y descuentos) y aplicar una regla única documentada y probada. No cambiar la fórmula sin esa definición.

### PUR-03 — Protección contra factura duplicada solo local
**Severidad: Crítica (duplicación de existencias y obligaciones).**
La verificación de proveedor + número de factura se hace sobre el arreglo `purchases` en el cliente. `purchaseInProgress` y su reinicio mediante efecto React son bloqueos locales de una instancia; no constituyen una restricción atómica compartida entre dispositivos o sesiones.
**Riesgo:** dos dispositivos pueden recibir la misma factura y duplicar stock, historial de costos y cuenta por pagar.
**Cierre requerido:** idempotencia y unicidad verificadas en servidor/transacción. No puede garantizarse solo con un cambio de interfaz ni con el snapshot JSON actual.

### PUR-04 — Recepción y efectos contables no son atómicos
**Severidad: Crítica (consistencia de datos).**
`receivePurchase` calcula los nuevos productos y luego actualiza por separado productos, movimientos, compras, créditos del proveedor, historial de costos y cuentas por pagar mediante distintos setters. La persistencia ocurre después por guardado del snapshot completo.
**Riesgo:** fallo, cierre de sesión o conflicto de sincronización entre operaciones puede dejar stock, compra, historial y saldo del proveedor desalineados.
**Cierre requerido:** operación transaccional del lado servidor con validación de permisos, idempotencia y escritura conjunta. Requiere diseño y pruebas de compatibilidad antes de tocar Supabase.

## Controles observados
- Se rechazan cantidades/costos no finitos o negativos y productos inexistentes/duplicados dentro del detalle.
- Se impide recibir servicios como mercancía.
- Se aplica la política actual de vencimiento mínimo de seis meses.
- El costo promedio ponderado valida rangos numéricos.
- La cuenta por pagar usa el total digitado menos créditos aplicados; su detalle no se conserva dentro de `PurchaseRecord`.

## Estado y límites
- Solo auditoría estática del código de la rama indicada; no se ejecutaron compras de prueba contra una base de datos.
- No se modificó código operativo ni Supabase.
- PUR-03 y PUR-04 no se consideran corregidos; requieren backend transaccional y pruebas en entorno aislado.
- PUR-01 y PUR-02 requieren definición contable y diseño de conciliación antes de implementar.
