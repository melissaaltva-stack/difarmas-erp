# Auditoría y corrección del crédito a favor de proveedores

Fecha: 2 de noviembre de 2026  
Rama: `security/erp-state-permission-matrix`

## Comportamiento implementado

- Una nota de crédito recibida se valida contra la devolución guardada y la compra vinculada.
- El importe reduce primero el saldo pendiente de la cuenta por pagar asociada.
- Si la compra fue de contado, ya estaba pagada o el crédito excede el saldo pendiente, el remanente se registra en un subledger de créditos del proveedor.
- El crédito se identifica por proveedor, devolución y compra de origen, conserva el importe original, saldo restante y aplicaciones posteriores.
- Al registrar una nueva compra a crédito, el ERP aplica automáticamente los créditos disponibles del mismo proveedor, en orden de antigüedad de registro. Solo el importe restante queda como cuenta por pagar.
- El saldo disponible y su historial se muestran en Proveedores > Cambios y devoluciones; Finanzas muestra el total de créditos a favor.
- Los créditos no crean entradas ni salidas de caja, no se clasifican como pagos y no se convierten en efectivo.
- Los créditos se guardan en el estado local y en la instantánea existente `erp_state`; no se requiere una tabla ni migración de Supabase.

## Pruebas añadidas

- Nota de crédito mayor que la cuenta por pagar: aplica el saldo pendiente y conserva el excedente.
- Compra de contado o factura ya pagada: conserva el crédito completo.
- Nota de crédito menor que la cuenta por pagar: reduce solo el importe de la nota.
- Aplicación de varios créditos a una compra futura del mismo proveedor.
- Conservación del saldo sobrante y aislamiento entre proveedores.
- Lectura del crédito y su historial desde la instantánea remota.


## Ajustes posteriores

- Los créditos disponibles también se aplican a compras de contado y transferencia. La compra conserva el total bruto de factura y guarda por separado `supplierCreditApplied`; así se distingue el importe de factura del desembolso real.
- Flujo de caja y cierre diario descuentan únicamente el importe neto en efectivo, no el total bruto cuando hubo crédito aplicado.
- Antes de recibir la compra, la pantalla muestra el crédito que se aplicará y el importe neto que se pagará o quedará por pagar.
- El historial de proveedores conserva visibles también los créditos totalmente utilizados, con saldo cero y sus facturas de aplicación.
- La creación del crédito usa una inserción idempotente en el actualizador de estado para impedir duplicados en actualizaciones concurrentes dentro de la misma instancia.
- Se añadieron pruebas para compra de contado cubierta parcial o totalmente y para evitar registrar dos veces la misma devolución.

## Límites conocidos

La protección de duplicados en el flujo de devolución opera dentro de la sesión del navegador y el guardado de la instantánea usa control de revisión. Esto no equivale a una transacción idempotente del lado del servidor entre dispositivos concurrentes. Para garantizar esa condición estrictamente se necesitaría una operación RPC/backend transaccional; no se creó ni modificó una función o tabla de Supabase.

Los créditos se aplican automáticamente a nuevas compras de cualquier forma de pago. En compras de contado y transferencia, el desembolso se calcula por el importe neto después del crédito aplicado; en compras a crédito, solo el remanente genera una cuenta por pagar.

## Seguridad y despliegue

- Cambios aislados en `security/erp-state-permission-matrix`.
- No se fusionó a producción.
- No se modificaron datos existentes ni el esquema de Supabase.
- No se realizó despliegue de producción.
