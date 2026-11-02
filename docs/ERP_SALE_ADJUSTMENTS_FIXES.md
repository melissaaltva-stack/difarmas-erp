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
