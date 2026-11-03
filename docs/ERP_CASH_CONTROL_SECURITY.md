# Auditoría de seguridad: caja, gastos y cierres FARMI

Estado: hallazgos de revisión estática; no se implementaron cambios funcionales.

## Alcance revisado

- `src/components/Finance.tsx`: registrar gastos, movimientos manuales de caja y cierre diario.
- `src/services/financeService.ts`: cálculo de caja y construcción de registros de cierre/movimiento.
- `src/hooks/useErpState.ts`: persistencia de gastos, cierres y movimientos dentro del snapshot general `erp_state`.
- `src/services/remoteErpState.ts`: guardado del snapshot y control optimista de revisión.

## CASH-01 — El cierre diario no es atómico entre sesiones

**Severidad: media — integridad financiera y duplicidad de cierres.**

La interfaz calcula `alreadyClosedToday` usando la lista de cierres que tiene cargada localmente. `closeCash` bloquea una segunda pulsación mediante `closingRef`, pero ese bloqueo solo existe en la instancia React actual. Después agrega el cierre mediante `setClosures`; no hay una restricción única en servidor por fecha de negocio ni una operación transaccional que vuelva a comprobar el estado.

Dos pestañas, navegadores o dispositivos que carguen el mismo estado antes del primer guardado pueden pasar la comprobación y crear dos cierres para el mismo día. El control optimista de `updated_at` puede detectar colisiones de snapshot, pero no ofrece por sí solo una operación de cierre con relectura, validación y registro atómicos; además, no debe suponerse que el cliente reintenta o reconcilia correctamente un cierre concurrente.

**Corrección recomendada:** operación de servidor para cerrar caja que determine la fecha local de negocio, bloquee la caja/registro del día, rechace si ya existe un cierre, recalcule los importes desde registros autoritativos y escriba el cierre en la misma transacción. Añadir clave de idempotencia y pruebas concurrentes con dos sesiones.

## CASH-02 — Gastos y movimientos manuales dependen de setters cliente

**Severidad: media como brecha de autorización/integridad del snapshot; no demuestra acceso anónimo.**

El alta de gastos crea el registro en `Finance.tsx` y actualiza `expenses` con un setter cliente. Los movimientos manuales leen valores del DOM, validan descripción e importe en el navegador y agregan el registro a `cashMovements`. Ambas colecciones se persisten como parte del snapshot general. No se observa una operación servidor específica que autorice el permiso de caja/gastos, valide las categorías/medios permitidos, aplique idempotencia y registre el movimiento como operación indivisible.

La validación de interfaz puede eludirse mediante una solicitud construida manualmente por una sesión que tenga acceso de escritura al snapshot. El riesgo no debe interpretarse como una prueba de que usuarios anónimos puedan escribir.

**Corrección recomendada:** funciones de servidor separadas para registrar gasto y movimiento, validación estricta de importe finito positivo, categorías y medios permitidos, autorización por permiso de módulo, idempotencia y auditoría. Evitar aceptar un snapshot arbitrario del navegador.

## CASH-03 — Identificadores generados en el cliente

La función `nextFinanceId` genera IDs usando hora local, IDs ya cargados y un contador en memoria del componente. Esto reduce colisiones dentro de una instancia, pero no constituye una secuencia compartida entre sesiones. Dos clientes pueden generar el mismo ID si comparten la misma base de IDs y ejecutan la operación en el mismo milisegundo. El esquema actual basado en arrays no ofrece una restricción de unicidad por registro dentro de la operación de escritura.

**Severidad: baja-media**, como riesgo complementario de integridad y trazabilidad. La probabilidad depende del momento y concurrencia; no se afirma que ya haya ocurrido.

**Corrección recomendada:** IDs generados en servidor (UUID/identity) y restricciones únicas en tablas normalizadas.

## Límites y estado

Hallazgos basados en revisión estática de la rama `security/erp-state-permission-matrix`. No se ejecutaron pruebas de concurrencia ni solicitudes de escritura de prueba. No se modificó código funcional, Supabase, filas, políticas, grants, funciones ni variables de entorno. No se promovió nada a producción.


## CASH-04 — El estado “reembolso pagado” lo declara el operador y crea directamente una salida

**Severidad: baja-media — trazabilidad del reembolso.**

En POS.tsx el formulario de devolución/anulación permite seleccionar “Reembolso pagado” y un medio de pago. Al registrar, ese estado se envía en el objeto de ajuste. En useErpState.ts, si el estado recibido es Pagado, se agrega directamente un CashMovement de salida por el excedente del reembolso. No se solicita ni conserva una referencia de transferencia, comprobante, autorización o identificador de pago que permita conciliar esa salida con el movimiento bancario/caja. El registro de ajuste y la salida se actualizan mediante setters de estado separados dentro del snapshot.

Esto no prueba que se pueda emitir un reembolso sin una sesión autorizada: es un control operativo débil que permite marcar como pagado un reembolso sin evidencia adjunta ni conciliación independiente, y puede generar diferencias si el pago real se ejecuta después o por otro canal.

**Corrección recomendada:** separar “aprobado/pendiente” de “pagado”; registrar el pago mediante una operación de servidor que exija usuario autorizado, importe, medio, referencia obligatoria para medios electrónicos, fecha y clave de idempotencia. Crear el movimiento de caja/banco y actualizar el estado del reembolso en la misma transacción. Para efectivo, requerir confirmación y registro auditable del responsable.

**Estado:** documentado; sin cambios funcionales ni datos.


## Cuentas por cobrar: confirmación de abonos

En `ReceivablesModule`, `collect` incrementa `receivables[].paid` y agrega un elemento a `paymentTransactions` mediante dos actualizaciones locales separadas. El aviso de éxito se muestra inmediatamente. `useErpState` persiste ambos campos dentro del snapshot completo con guardado diferido; la revisión optimista de `erp_state.updated_at` detecta conflictos de otras sesiones, pero la interfaz ya pudo mostrar el abono como registrado antes de que el guardado remoto termine. Si el guardado falla, se marca el estado global de sincronización como error, pero no se revierte automáticamente el abono local.

**Riesgo:** conciliación financiera y confirmación engañosa ante fallo de sincronización (medio). No se ha demostrado pérdida permanente de datos; el snapshot puede permanecer localmente modificado y requerir recarga/reconciliación.

**Recomendación:** registrar el abono en una operación de servidor transaccional e idempotente que valide saldo, método, importe y referencia, actualice la cuenta y añada el movimiento de cobro en una sola transacción. Mostrar éxito solo tras recibir confirmación del servidor y reconciliar el estado local con la respuesta confirmada. No aplicar una corrección solo de interfaz como sustituto de atomicidad.

**Estado:** hallazgo documentado; sin cambios en Supabase ni en datos de negocio.


## Cuentas por pagar: doble flujo de registro y confirmación

La interfaz permite registrar pagos desde `PayablesModule` y desde `Finance.tsx` (`paySupplier`). Ambos flujos modifican `payables[].paid` y agregan `PaymentTransaction` tipo `Pago proveedor` en el estado local; ambos se persisten posteriormente dentro del snapshot completo. Los bloqueos `processing` / `paymentLocks` viven únicamente en memoria del navegador y se limpian al cambiar los arrays. No constituyen una reserva compartida entre pestañas o dispositivos ni una garantía de idempotencia en el servidor.

`PayablesModule.pay` muestra inmediatamente “Pago registrado correctamente”; `Finance.tsx.paySupplier` tampoco espera una confirmación remota antes de finalizar la acción. El guardado real del snapshot es diferido y puede fallar por conflicto de revisión o conexión. En ese caso, la interfaz puede haber mostrado el pago como realizado localmente aunque no esté confirmado en Supabase. La misma obligación puede intentarse pagar desde sesiones diferentes; la revisión optimista protege la fila completa de sobrescrituras silenciosas, pero no ejecuta una transacción financiera que reserve saldo y registre el pago de forma indivisible.

**Conciliación de caja:** `Finance.tsx` calcula los pagos de proveedor en efectivo a partir de `paymentTransactions` y usa esos importes en el flujo de caja y el cierre diario. No se observó una omisión general de los pagos registrados en ese cálculo. El riesgo se presenta cuando el movimiento de pago y el saldo de la obligación no quedan confirmados juntos en la nube.

**Severidad:** media-alta para integridad de cuentas por pagar y confirmación del pago; posible impacto en conciliación si una sesión cree que el pago quedó registrado cuando el guardado falló. No se ha demostrado una doble salida bancaria real ni pérdida permanente de datos.

**Corrección recomendada:** consolidar ambos puntos de entrada en una única operación transaccional de servidor, con clave de idempotencia, bloqueo/validación del saldo pendiente y registro atómico del pago y su método/fecha. Devolver el estado confirmado y mostrar éxito solo después de esa respuesta; ante conflicto, recargar el saldo confirmado y no dejar el pago local como exitoso. Mantener los dos accesos de interfaz si se desea, pero deben invocar la misma operación autorizada.

**Estado:** hallazgo documentado; no se modificaron datos de negocio, Supabase ni el comportamiento funcional.


## Gastos, movimientos manuales y cierre diario

**Gastos:** `Finance.tsx.addExpense` valida descripción no vacía e importe finito mayor que cero y agrega el gasto al estado local. El método de pago se conserva para distinguir efectivo de transferencia. No se observa confirmación individual del servidor; el gasto se incluye en el snapshot general y depende de la sincronización diferida. Una falla de sincronización puede dejar el navegador mostrando el gasto localmente sin confirmación remota.

**Movimientos manuales:** el formulario de caja valida descripción e importe finito positivo y crea un movimiento con ID generado en el cliente. La categoría `Banco` se excluye del efectivo físico; las demás categorías participan en el cálculo de entradas/salidas. El registro se agrega al estado local y no tiene operación remota individual ni idempotencia. Dos sesiones pueden generar movimientos independientes sin una secuencia compartida. No se encontró una validación de autorización por tipo/categoría en el componente; la protección de escritura depende del mecanismo general de snapshot.

**Cierre diario:** `alreadyClosedToday` consulta cierres cargados en el navegador y `closingRef` evita doble clic en esa instancia. El cierre se agrega con `setClosures` y se persiste en el snapshot general. No hay restricción única en servidor por usuario y fecha ni transacción que reserve el día y capture simultáneamente los movimientos que forman el saldo. Dos dispositivos con la misma revisión inicial pueden intentar crear cierres del mismo día; el control optimista del snapshot puede rechazar una de las escrituras por conflicto, pero no equivale a una operación atómica con clave única. El botón se deshabilita localmente al cambiar `isClosing`, y el estado se reinicia cuando cambia `closures`.

**Conciliación revisada:** el efectivo esperado incluye ventas al contado, cobros en efectivo, movimientos manuales de caja, gastos en efectivo, compras al contado y pagos a proveedores en efectivo. Las compras al contado y pagos a proveedores se calculan por separado; no se observó que una compra a crédito se reste como compra al contado. El cierre guarda `dayExpenses` y `dayCashPurchases` en campos separados. Esta revisión de código no demuestra que todos los datos históricos estén completos ni que no existan registros duplicados preexistentes.

**Severidad:** media-alta para la unicidad y consistencia de cierres; media para gastos y movimientos por ausencia de confirmación remota individual e idempotencia. No se ha demostrado una duplicación efectiva de cierres o movimientos en producción.

**Corrección recomendada:** centralizar el registro de gastos, movimientos y cierres en operaciones de servidor autorizadas, con validación de importe, método/categoría, fecha y usuario; claves de idempotencia; y cierre diario único por usuario/fecha mediante restricción y transacción. Mostrar éxito solo tras confirmación del servidor. Para el cierre, calcular y congelar en la misma transacción los movimientos elegibles y el saldo inicial/final.

**Estado:** hallazgos documentados; no se modificaron datos de negocio, Supabase, políticas ni comportamiento funcional.


## Compras, proveedores y conciliación de créditos

**Total de factura no conciliado con el detalle:** `Purchases.tsx` calcula subtotal de líneas e ISV, pero permite introducir un total manual (`invoiceTotal`). Ese importe sustituye al total calculado y se envía a `receivePurchase`. `useErpState.receivePurchase` solo valida que el total introducido sea finito y no negativo; no verifica que coincida con la suma de líneas más ISV ni registra una diferencia justificada. El total manual se usa para la compra, para aplicar créditos del proveedor y para determinar la cuenta por pagar. La recepción de inventario y el historial de costo, en cambio, usan las cantidades y costos unitarios de las líneas. Esto puede dejar discrepancias entre valor de inventario/costo histórico y obligación o pago registrado. Severidad alta para integridad financiera.

**Duplicidad de factura:** el formulario y `receivePurchase` comparan proveedor + número de factura contra las compras cargadas en el navegador. La validación es útil en una sesión, pero no existe una clave única de factura por proveedor aplicada en una transacción de servidor para todas las sesiones. Una carrera entre dispositivos o datos locales desactualizados no queda resuelta por esta comprobación. No se ha demostrado que existan facturas duplicadas en los datos actuales.

**Créditos del proveedor:** `applySupplierCreditsToPurchase` aplica saldos en centavos, limita la aplicación al total de factura y conserva aplicaciones con compra, factura, importe y fecha. La aplicación en la recepción normal, sin embargo, se hace en memoria y se guarda dentro del snapshot general; no hay operación de servidor específica que valide y consuma el saldo de forma atómica junto con la recepción, el inventario y la cuenta por pagar. El emparejamiento del crédito se basa en el nombre normalizado del proveedor, no en un identificador inmutable.

**Nota de crédito por devolución:** se encontró una protección más sólida ya implementada para el paso `Nota de crédito recibida`: `resolveSupplierCreditNoteAtomically` llama a `resolve_supplier_credit_note`. La migración `202611020002_supplier_credit_note_atomic.sql` usa `FOR UPDATE` sobre `erp_state`, valida rol/permisos, comprueba estado previo y crédito existente para la devolución, reduce la cuenta por pagar y registra el remanente como crédito en la misma transacción. La función es idempotente frente a una segunda resolución de la misma devolución y devuelve el snapshot actualizado. Esta protección aplica a la resolución de notas de crédito por devolución; no hace atómica toda la recepción de compra ni la aplicación ordinaria de créditos a nuevas facturas. La migración está en la rama de auditoría; no se verificó aquí que esté aplicada en el proyecto Supabase.

**Estado y recomendaciones:** no se modificó código funcional ni datos. Reconciliar total factura = subtotal de líneas + ISV, o exigir una diferencia explícita con motivo y tratamiento contable; validar importes en servidor. Imponer unicidad por proveedor y factura en una operación transaccional. Convertir recepción, actualización de inventario, consumo de crédito y creación de cuenta por pagar en una única operación idempotente. Vincular proveedores mediante ID estable y no solo por nombre. Verificar el estado real de aplicación de la migración antes de depender de la protección de nota de crédito en producción.
