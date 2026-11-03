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
