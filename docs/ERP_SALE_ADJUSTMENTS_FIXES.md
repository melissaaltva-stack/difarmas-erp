# Correcciones de devoluciones y reportes

Rama: `security/erp-state-permission-matrix`

## Cambios implementados

- Se creó `src/services/saleAdjustmentService.ts` para producir una proyección neta de ventas tras devoluciones y anulaciones. Calcula ingresos, costo, utilidad y unidades netas sin modificar la venta original.
- Se añadieron pruebas en `src/services/saleAdjustmentService.test.ts` para devoluciones parciales, ventas históricas sin detalle, inmutabilidad y límites.
- Dashboard, Reportes, Gestión gerencial y Asistente IA reciben la proyección neta. POS y conciliación de caja siguen usando ventas originales.
- POS ahora guarda el medio real del reembolso y el estado de liquidación, además del método original de la venta.
- El dominio descuenta primero el saldo pendiente de una cuenta por cobrar. Solo el excedente se considera importe reembolsable.
- Solo se crea salida de caja/banco cuando el excedente se marca como pagado. Las transferencias se clasifican como Banco para no reducir el efectivo físico.
- Se agregó un bloqueo local por venta para reducir duplicados en la misma instancia y validación antes de adquirir el bloqueo.
- El historial de ajustes muestra estado de reembolso y excedente.

## Límites que permanecen

- El bloqueo no garantiza idempotencia entre dispositivos o sesiones; se requiere operación transaccional en servidor con clave idempotente.
- No existe todavía un submódulo de pasivos por reembolsos pendientes ni una cuenta independiente de crédito a favor de clientes. El excedente queda registrado dentro del ajuste.
- Los ajustes históricos anteriores a estos campos aparecen como `Histórico sin conciliar`; no se reinterpretan ni se modifican.
- La revisión no ha ejecutado transacciones reales contra Supabase ni ha alterado datos históricos.
- No se ha fusionado la rama ni desplegado a producción.

## Validación

GitHub Actions para el commit `4e54d0be804a861c18c66be0b3541057ff53e2be` completó correctamente instalación, auditoría de dependencias, build TypeScript/Vite y pruebas Vitest. Los cambios posteriores de presentación del historial requieren su propio resultado CI.

- Se bloqueó la edición de una factura estándar después de que tenga devoluciones/anulaciones, para evitar desalinear el detalle original, el inventario y los ajustes ya aplicados.
- Se añadió una reserva local de resolución de devoluciones a proveedor hasta que el cambio de estado se refleje, evitando repetir una nota de crédito o reingreso de mercancía por doble clic inmediato.

- Se agrupan filas repetidas del mismo producto en la selección de devolución del POS y en los cálculos netos, usando precio y costo unitario promedio ponderado. Esto evita aplicar una misma cantidad dos veces cuando el producto se agregó en varias líneas de la venta.

- Al reingresar productos devueltos al inventario, se recalcula el costo promedio ponderado usando el costo histórico de las unidades devueltas. La existencia y el valor al costo quedan alineados; solo aplica cuando se marca el reingreso al stock.

- Los reembolsos por tarjeta u otros medios no efectivos se clasifican como `No efectivo`; las transferencias se clasifican como `Banco`. Ninguno reduce el efectivo físico en el flujo ni en el cierre diario.
- Se corrigió el cálculo de devoluciones de facturas estándar con ISV: el importe reembolsable incluye el impuesto de las líneas; los reportes reducen por separado ingreso neto e impuesto, conservando la utilidad calculada sin ISV. Se añadió validación de importes de impuesto y una prueba específica de devolución total con ISV.
- Para ventas históricas sin detalle de líneas, el impuesto registrado se reduce proporcionalmente al importe del ajuste, sin reescribir los registros originales.
- Validación del commit `4e461535e183e4229dd37281730a135bc5ec0c6d`: GitHub Actions completó correctamente `npm install`, auditoría de dependencias, `npm run build` y `npm test`. El check independiente de Vercel reportó límite de compilaciones del plan; no se publicó una vista previa nueva.

## Auditoría de costo promedio y devoluciones a proveedores

- Se centralizó el cálculo del costo promedio ponderado en `calculateWeightedAverageCost`, con validación de existencias, cantidades, costos, desbordamientos y redondeo uniforme a dos decimales.
- Compras, devoluciones de ventas reincorporadas al inventario y cambios recibidos del proveedor usan ahora la misma regla de valuación.
- Se evita confirmar un cambio recibido si la nueva existencia o valuación no puede calcularse correctamente.
- Se añadieron pruebas unitarias del promedio ponderado, redondeo y entradas inválidas.
- `purchaseCostHistory` conserva su significado de historial de costos de compra. Las devoluciones/cambios quedan reflejados en `inventoryMovements` con su costo unitario y referencia; no se registran falsamente como compras nuevas.

### Pendientes identificados

- Una nota de crédito de proveedor solo puede aplicarse actualmente contra una cuenta por pagar abierta. Si la compra original fue de contado o el proveedor emite un crédito superior al saldo pendiente, el flujo no puede registrar el excedente ni un saldo a favor del proveedor. Hace falta un subregistro de créditos de proveedor y su aplicación posterior; no se modificó el comportamiento financiero actual.
- No existe conciliación transaccional del estado de devolución entre varios dispositivos; las protecciones actuales son locales al cliente.
- No se alteraron compras, cuentas por pagar ni movimientos históricos.
- Validación del lote de costo promedio en GitHub Actions (commit `92e0a4dfa1924fa3459a5288a36aea58399f0396`): `npm install`, auditoría de dependencias, `npm run build` y `npm test` finalizaron correctamente.
- Hallazgo pendiente en devoluciones parciales: el POS consolida renglones repetidos por producto y calcula un precio/costo promedio. Si el mismo producto se vendió en renglones con descuentos o precios distintos, no permite identificar exactamente cuál renglón se está devolviendo. Para corregirlo de forma segura se requiere conservar un identificador por renglón de venta desde el POS hasta el registro de devolución; no se hizo una aproximación que pudiera alterar reembolsos históricos.

## Corrección adicional: devoluciones por renglón de venta (2 de noviembre de 2026)

- Cada nueva línea de venta conserva un identificador estable derivado de la línea del carrito.
- La ventana de devoluciones presenta renglones individuales cuando un mismo producto se vendió más de una vez, incluso si cada renglón tiene precio o descuento distinto.
- La cantidad devuelta se valida contra el renglón exacto y no solamente contra el producto.
- Los ajustes guardan el identificador de línea; los registros históricos sin identificador conservan el comportamiento anterior de agrupación por producto y precio promedio ponderado.
- La proyección de ventas netas reduce el renglón correcto y mantiene los renglones no devueltos sin alterar el registro original.
- Se agregaron pruebas para devolución de una de dos líneas del mismo producto a precios distintos, rechazo de una segunda devolución duplicada y compatibilidad con ajustes históricos.

**CI verificada:** ejecución 41542194676, commit 8aef4a9fa1b652d7583f7125fa18d37c26de2fd9. Compilación correcta, auditoría de dependencias sin vulnerabilidades y 92 pruebas aprobadas en 13 archivos.

## Validación adicional de devoluciones a proveedores (2 de noviembre de 2026)

- La salida de inventario ahora verifica el registro persistido en el estado ERP: solo permite despachar devoluciones que siguen en estado "Pendiente".
- Las cantidades, costos, productos y motivo se toman del registro almacenado, no de los datos enviados por el componente. Esto evita que una referencia manipulada o desactualizada cambie el movimiento de inventario.
- La resolución de cambio recibido y nota de crédito también usa los datos del registro guardado, no los valores de una copia antigua del componente.
- No se modificó el comportamiento contable de las notas de crédito. Sigue pendiente el subregistro de crédito a favor para compras de contado, facturas pagadas o importes que exceden una cuenta por pagar; se mantiene el rechazo explícito para no perder valor ni crear saldos incorrectos.

**CI verificada:** ejecución 41544608729, commit 0de35f29cd7375a93a366b47ab99e8b4031daabf. Compilación, auditoría de dependencias y pruebas completadas correctamente.
