# Seguridad de cobros y pagos en FARMI

Estado: diseño técnico; no conectado al guardado ni desplegado.

## Hallazgos confirmados en la rama de auditoría

- `PaymentTransaction` tiene un discriminador obligatorio: `type: 'Cobro' | 'Pago proveedor'`, además de `accountId`, `party`, `amount`, `date` y `paymentMethod`.
- `FinancialModules.tsx` registra cobros actualizando `receivables` y agregando una transacción `Cobro`.
- El mismo archivo registra pagos actualizando `payables` y agregando una transacción `Pago proveedor`.
- `Finance.tsx` contiene implementaciones equivalentes para ambas operaciones. Por tanto, existen más de dos puntos de escritura y no se debe proteger solo uno de ellos.
- El módulo de resumen e historial lee ambos tipos, pero una lectura no debe conceder permiso para modificarlos.
- `useErpState.ts` persiste `receivables`, `payables` y `paymentTransactions` como claves independientes dentro de un snapshot JSONB completo. Una autorización por clave no puede aislar filas o tipos dentro de esas colecciones.

## Riesgo principal

Autorizar `paymentTransactions` por completo a Cuentas por cobrar o Cuentas por pagar permite alterar movimientos del otro módulo. Autorizar `receivables` o `payables` por completo tampoco es suficiente: esas colecciones también se crean o ajustan desde ventas, facturación, compras y devoluciones.

El cliente puede ocultar botones o validar datos, pero eso no constituye una barrera de seguridad. La autorización definitiva debe ejecutarse en PostgreSQL dentro de una operación atómica.

## Contrato recomendado para operaciones futuras

Crear dos operaciones servidoras independientes (RPCs o funciones transaccionales equivalentes):

### Registrar cobro
- Exigir sesión autenticada, cuenta activa y permiso `cuentas_cobrar` (o rol Administrador autorizado).
- Recibir únicamente identificador de cuenta, monto, fecha/medio de pago permitidos y una clave de idempotencia.
- Buscar la cuenta por cobrar en servidor; no confiar en el cliente para tipo, titular, saldo ni estado.
- Validar monto finito y positivo, saldo disponible, cuenta existente y que el registro sea de una cuenta por cobrar.
- Actualizar el saldo y crear una transacción cuyo tipo sea siempre `Cobro`, en la misma transacción SQL.
- Rechazar IDs duplicados/idempotencia repetida sin duplicar el cobro.

### Registrar pago a proveedor
- Exigir sesión autenticada, cuenta activa y permiso `cuentas_pagar` (o rol Administrador autorizado).
- Recibir únicamente identificador de cuenta, monto, fecha/medio de pago permitidos y clave de idempotencia.
- Buscar la cuenta por pagar en servidor; no confiar en titular, saldo ni tipo enviados por el cliente.
- Validar monto finito y positivo, saldo disponible y cuenta existente.
- Actualizar el saldo y crear una transacción cuyo tipo sea siempre `Pago proveedor`, en la misma transacción SQL.
- Rechazar IDs duplicados/idempotencia repetida sin duplicar el pago.

## Cambios de arquitectura necesarios antes de activar estos controles

1. Mover ambos formularios para que llamen a una única función de servicio por operación. Eliminar las escrituras duplicadas de `Finance.tsx` y `FinancialModules.tsx`; no mantener una ruta alternativa que escriba directamente al snapshot.
2. Evitar que los roles de Cuentas por cobrar/pagar tengan UPDATE general sobre `erp_state.state`. Mientras los datos sigan dentro de un único JSONB, una RPC que modifique el JSON completo todavía requiere validar y preservar las otras claves bajo bloqueo de fila; no se debe aceptar un snapshot arbitrario del navegador.
3. Para seguridad duradera, normalizar cuentas y transacciones en tablas separadas con RLS y claves foráneas. Las RPCs deben validar permisos y realizar actualización de saldo + inserción de transacción atómicamente.
4. Diseñar operaciones independientes para la creación de cuentas: ventas/facturación pueden crear cuentas por cobrar; compras pueden crear cuentas por pagar. No dar permiso de cobro para crear o reescribir cuentas, ni permiso de pago para modificar compras.
5. Mantener lectura de reportes/historial separada de escritura. El resumen financiero puede necesitar permisos de lectura combinados, pero no debe heredar permisos de modificación.
6. Definir una política explícita de migración de los registros históricos desde JSONB a tablas normalizadas, con conteos y conciliación antes/después. No borrar ni sobrescribir el snapshot original durante la migración.

## Pruebas obligatorias

- Un usuario con solo `cuentas_cobrar` puede registrar un cobro válido y no puede registrar un pago a proveedor.
- Un usuario con solo `cuentas_pagar` puede registrar un pago válido y no puede registrar un cobro.
- Ambos roles no pueden cambiar manualmente `type`, `accountId`, `party`, `amount`, `paid` ni el saldo de otra cuenta.
- No se permite sobrepago, monto cero/negativo, cuenta inexistente ni cuenta de tipo incorrecto.
- Dos solicitudes simultáneas no pueden sobrepasar el saldo ni duplicar el movimiento.
- Reintentos con la misma clave de idempotencia no duplican operaciones.
- Ventas/compras siguen creando sus cuentas respectivas sin otorgar permiso para cobrarlas/pagarlas.
- Historial y resumen conservan los cálculos con registros antiguos y nuevos.
- Usuario de solo lectura puede consultar únicamente lo que su permiso de lectura permita y no puede ejecutar ninguna RPC de escritura.
- Confirmar que el usuario sin permisos, inactivo o con metadatos incompletos recibe denegación por defecto.

## Estado y límites

Este documento registra hallazgos de revisión estática del código en la rama `security/erp-state-permission-matrix`. No se ejecutaron pruebas, no se creó ni aplicó SQL, no se conectó una RPC, no se migraron datos y no se modificó producción. El snapshot local/remoto y el flujo de primera inicialización deben preservarse hasta que exista un plan de migración y pruebas de regresión.
