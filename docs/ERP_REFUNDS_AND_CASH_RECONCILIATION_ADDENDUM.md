# Addendum: conciliación de caja y rutas de cobros/pagos

Fecha de revisión: 2026-11-02
Rama: `security/erp-state-permission-matrix`

## Confirmación adicional

### Métodos de efectivo personalizados
Confirmado en `src/components/Finance.tsx`: el cierre diario calcula `daySales` filtrando `sale.payment === 'Efectivo'`. El POS, en cambio, utiliza la configuración del método de pago y su propiedad `kind` para clasificarlo. Por tanto, un método personalizado de tipo efectivo no coincide necesariamente con el filtro literal del cierre.

El mismo modelo de venta (`SaleRecord`) guarda `payment:string`, no una categoría estable del método. El problema no se resuelve renombrando el método: la fuente de verdad debe ser el tipo persistido en la transacción.

### Cobros y pagos: no se confirmó doble montaje simultáneo
En `src/App.tsx`, las secciones de cuentas por cobrar y cuentas por pagar renderizan sus módulos dedicados (`ReceivablesModule` / `PayablesModule`). Para el resto de finanzas se renderiza `Finance`. No se observó que ambos módulos se monten simultáneamente en la ruta normal. Por eso, la existencia de lógica de cobro/pago en más de un componente no basta para afirmar que haya doble contabilización en una sesión normal.

Los módulos dedicados mantienen un bloqueo local de procesamiento por cuenta y actualizan el saldo junto con el registro de transacción. En `Finance`, hay otro bloqueo local para sus funciones de cobro/pago. Estos bloqueos son protecciones de interfaz; no constituyen idempotencia entre dispositivos ni transacciones del servidor. No se encontró evidencia suficiente en esta revisión para elevar una duplicación de cobros como bug confirmado de la ruta normal.

## Recomendaciones
1. Añadir categoría estable del método de pago en cada venta y usarla en POS, reportes, flujo y cierre.
2. Mantener la compatibilidad con registros antiguos que solo contienen el nombre del método; no reinterpretar ventas históricas automáticamente.
3. Para cobros, pagos y reembolsos, migrar gradualmente a operaciones de servidor transaccionales e idempotentes antes de habilitar concurrencia multiusuario.

No se modificó código de negocio ni datos. No se ejecutaron migraciones ni despliegues.
