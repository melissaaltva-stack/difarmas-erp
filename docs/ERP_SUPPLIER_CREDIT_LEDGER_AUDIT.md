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
- La creación del crédito se realiza ahora mediante `resolve_supplier_credit_note`, una función PostgreSQL transaccional que bloquea la fila `erp_state` de la cuenta, valida el estado actual y actualiza devolución, cuenta por pagar y subledger en una sola transacción.
- Dos dispositivos que intenten procesar la misma devolución se serializan por el bloqueo de fila: el primero cambia el estado; el segundo recibe un rechazo porque la devolución ya no está en estado `Enviado al proveedor` o el crédito ya existe.
- El RPC valida sesión, estado activo y rol autorizado en `app_metadata`; no usa `service_role` y no crea tablas nuevas.
- El cliente serializa la llamada con los guardados de la instantánea y cancela el autosave pendiente para evitar que un snapshot antiguo revierta el resultado confirmado por el servidor.

## Límites conocidos

La protección transaccional ya está implementada en código y en la migración `supabase/migrations/202611020002_supplier_credit_note_atomic.sql`. **Debe aplicarse esa migración al proyecto Supabase conectado al entorno de prueba antes de usar el botón “Nota de crédito”**. Hasta aplicar la migración, el RPC no existirá y la operación fallará de forma segura; no se debe volver al registro local como alternativa.

Los créditos se aplican automáticamente a nuevas compras de cualquier forma de pago. En compras de contado y transferencia, el desembolso se calcula por el importe neto después del crédito aplicado; en compras a crédito, solo el remanente genera una cuenta por pagar.

## Seguridad y despliegue

- Cambios aislados en `security/erp-state-permission-matrix`.
- No se fusionó a producción.
- Se añadió una migración SQL para una función RPC; no se ejecutó desde este entorno porque no hay una conexión administrativa al proyecto Supabase.
- No se modificaron datos existentes ni se desplegó a producción.
