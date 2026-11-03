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


## Facturación, correlativos y autorización fiscal

**Dos generadores de correlativo:** POS utiliza `settings.documentNumbering.factura.nextNumber` y avanza el contador en el estado local después de `recordSale`. Facturación estándar genera su número independientemente, buscando el mayor sufijo numérico de 10 dígitos entre las facturas estándar y sumando uno. No comparten un asignador ni una reserva central. El estándar tiene además un valor inicial propio (`001-001-00001002037` según el cálculo actual). Esto puede crear secuencias separadas, saltos y colisiones operativas cuando se emiten documentos desde ambos módulos o desde varios dispositivos. Severidad alta si ambos se usan para numeración fiscal.

**Duplicidad y concurrencia:** POS no tiene una reserva central del correlativo; el contador se guarda en el snapshot después de registrar la venta. `recordSale` solo comprueba duplicados para facturas estándar (`invoiceDetails`), no para números asignados por POS. Facturación estándar comprueba el número contra las facturas ya cargadas y vuelve a comprobar en `recordSale`, pero ambas validaciones son locales a la revisión cargada. No existe en el código revisado un índice único ni una operación servidor que reserve correlativo y registre la factura en una misma transacción. Dos sesiones pueden intentar usar el mismo número antes de sincronizar. No se ha demostrado que existan números duplicados en los datos actuales.

**Validación fiscal solo en cliente:** `validateFiscalAuthorization` verifica presencia de CAI, códigos, rango y fecha de vencimiento en el navegador antes de cobrar desde POS. Si no hay CAI configurado, devuelve `null` y POS genera un número interno con prefijo. La operación `recordSale` del hook no vuelve a validar CAI, rango, vencimiento, establecimiento, punto de emisión ni secuencia; acepta el número recibido desde el componente. La validación del navegador no es una barrera de seguridad frente a solicitudes manipuladas ni asegura autorización fiscal en servidor.

**Naturaleza del documento estándar:** el estado inicial de configuración incluye la leyenda `Documento interno. Configure la autorización fiscal vigente del SAR antes de emitir comprobantes fiscales.` La plantilla de impresión de facturación estándar presenta `FACTURA COMERCIAL`. No debe confundirse esa factura comercial interna con un comprobante fiscal autorizado por SAR. La interfaz permite capturar número y detalles, pero el código revisado no acredita una integración de autorización electrónica ni una reserva fiscal del SAR.

**Datos y cálculos:** `recordSale` recibe del cliente `invoiceNumber` y `StandardInvoiceDetails`; utiliza importes de líneas, descuentos e impuestos enviados por el componente. La revisión previa de integridad de precios/impuestos ya está documentada en `ERP_PRODUCT_INVENTORY_SECURITY.md`; este hallazgo añade que los valores enviados no se validan contra una fuente fiscal autoritativa en el servidor.

**Severidad:** alta para uso de numeración fiscal en múltiples módulos/dispositivos y para depender de una validación exclusivamente cliente. No se afirma que FARMI haya emitido comprobantes SAR inválidos; el hallazgo es una limitación del control técnico revisado.

**Corrección recomendada:** definir un único tipo de documento y un único asignador de correlativos por establecimiento, punto de emisión y tipo documental. Reservar cada número mediante una operación transaccional del servidor, con unicidad en base de datos, validación de CAI/rango/fecha y registro de factura en la misma transacción. Mantener separados los documentos comerciales internos de los comprobantes fiscales SAR y mostrar claramente su estado. No reutilizar ni retroceder correlativos tras una emisión confirmada. La implementación requiere una decisión de diseño fiscal y autorización expresa antes de tocar base de datos o producción.

**Estado:** hallazgos documentados; no se cambió la lógica de facturación, la configuración fiscal, Supabase ni producción.

## Sesiones, caché local y protección de datos del navegador

**SESSION-01 — Datos operativos persistidos en texto legible en el navegador**

src/hooks/useErpState.ts persiste múltiples colecciones del ERP mediante saveJson y saveNumber; src/utils/storage.ts serializa los valores directamente con JSON.stringify en localStorage. El snapshot remoto incluye clientes, productos, ventas, compras, costos, cuentas por cobrar/pagar, gastos, movimientos, cierres y configuración. Por tanto, parte sustancial de la información comercial y financiera queda disponible en el almacenamiento del perfil del navegador en formato legible para cualquier script que se ejecute en el mismo origen y para quien obtenga acceso al perfil/desbloqueo del dispositivo.

La clave difarmas_owner_user_id evita hidratar normalmente la caché de una cuenta distinta cuando ya existe un propietario guardado, pero no cifra los datos ni es una barrera criptográfica. Si la clave de propietario no existe, el código permite cargar la caché anterior como semilla de la primera cuenta; esto conserva compatibilidad de migración, pero exige especial cuidado en equipos compartidos o perfiles de navegador reutilizados.

**SESSION-02 — Cerrar sesión no elimina la caché de negocio**

AuthGate.signOut ejecuta supabase.auth.signOut() y actualiza el estado React, pero no limpia las claves difarmas_* ni difarmas_owner_user_id. El hook conserva por diseño esos datos locales después de cerrar sesión. La comprobación del propietario reduce el riesgo de que otra cuenta cargue la copia por error, pero la información permanece en el navegador y puede ser vista por una persona con acceso al mismo perfil o por código malicioso ejecutado en el origen.

**SESSION-03 — Sesión Supabase persistente**

src/services/supabaseClient.ts configura persistSession: true y autoRefreshToken: true. Esto es el comportamiento habitual para mantener la sesión, no un hallazgo por sí solo. El acceso debe seguir dependiendo de la validación del token y de RLS/servidor; la persistencia de sesión no sustituye la revocación inmediata ni la autorización por operación. El signOut llama al cierre global de Supabase y solo actualiza el estado local después de recibir respuesta satisfactoria.

**Controles positivos observados:** el cliente utiliza únicamente VITE_SUPABASE_URL y VITE_SUPABASE_PUBLISHABLE_KEY; .env.example advierte expresamente no exponer claves secretas ni service_role en el navegador. remoteErpState.ts filtra por user_id, comprueba que el propietario devuelto coincida con el usuario y aplica actualización condicional por updated_at para rechazar sobrescrituras obsoletas. Esto mejora aislamiento y concurrencia de snapshots, pero no cifra la copia local ni convierte las operaciones financieras en transacciones independientes.

**Severidad:** media para privacidad de datos en dispositivos compartidos/perfiles reutilizados; alta si el navegador o el origen llegaran a sufrir XSS, porque el almacenamiento local no es una frontera frente a scripts del mismo origen. No se observó exposición de la clave service role en los archivos cliente revisados. Esta revisión estática no demuestra que haya ocurrido una filtración.

**Corrección recomendada:** definir una política explícita para dispositivos compartidos. Como mínimo, limpiar las claves de caché operativa y el identificador de propietario después de un cierre de sesión exitoso, y no permitir que una cuenta nueva use una caché sin propietario como semilla salvo un flujo de migración controlado. Antes de hacerlo, diseñar cómo se conserva cualquier cambio pendiente y cómo se recuperan datos si el usuario cierra sesión sin sincronización; no borrar información no sincronizada silenciosamente. Para protección fuerte, reducir los datos sensibles almacenados en el navegador y servirlos bajo autorización, reforzar prevención XSS/CSP y controles de sesión. No guardar secretos de servidor en el cliente.

**Estado:** hallazgos documentados; no se modificó código funcional, almacenamiento del navegador del usuario, Supabase, políticas, usuarios ni producción.


## Controles de plataforma: RLS, políticas y cabeceras del navegador

**PLATFORM-01 — RLS está habilitado, pero la migración no fuerza RLS para el propietario de la tabla**

La migración inicial `202610170001_erp_state.sql` crea `public.erp_state`, habilita Row Level Security y concede SELECT/INSERT/UPDATE a `authenticated`, sin DELETE. Las políticas comparan `auth.uid()` con `user_id`. La migración de endurecimiento `202611020001_erp_state_role_write_guard.sql` recrea SELECT/INSERT/UPDATE para exigir además cuenta activa y rol de la aplicación en INSERT/UPDATE. No se observa `ALTER TABLE ... FORCE ROW LEVEL SECURITY` en estas migraciones.

**Interpretación:** RLS protege las solicitudes ordinarias de los roles cliente sujetos a políticas, pero el propietario de la tabla y roles con privilegios de bypass pueden no quedar sujetos a RLS. Esto no constituye por sí solo una vulnerabilidad para el rol `authenticated`; es una limitación del perímetro de defensa en profundidad. No se consultó ni modificó el estado real de privilegios de la tabla en el proyecto remoto.

**PLATFORM-02 — La autorización RLS es por cuenta y rol general, no por permiso de módulo**

Las políticas de `erp_state` permiten UPDATE a cualquier usuario activo cuyo `farmi_role` pertenezca a Administrador, Supervisor, Ventas, Compras o Finanzas. No comprueban `farmi_permissions` ni limitan las claves JSON que cada rol puede modificar. Como el snapshot contiene módulos distintos en una misma fila JSON, una cuenta con permiso de escritura a nivel de fila puede enviar cambios a datos de otros módulos aunque la interfaz oculte esas pantallas. El rol Solo lectura queda fuera de la lista de escritura en esta migración, pero la separación de permisos por módulo no está aplicada en la base de datos.

**Severidad:** alta para separación de funciones y mínimo privilegio. La exposición depende de la aplicación efectiva de esta migración en Supabase; no se ha verificado el estado remoto y no debe asumirse que el archivo SQL ya fue aplicado.

**Corrección recomendada:** migrar operaciones críticas a tablas/funciones de servidor con autorización por acción y permiso; evitar aceptar reemplazos arbitrarios del JSON completo. Si se conserva la tabla snapshot durante una transición, definir una estrategia de autorización de escritura por rol y módulo y probarla con cuentas de cada rol antes de aplicarla. Evaluar FORCE RLS y privilegios de tabla con una migración controlada, revisando primero funciones administrativas y flujos legítimos.

**PLATFORM-03 — No se observó una política explícita de Content Security Policy ni cabeceras de seguridad en el repositorio**

En `index.html` no hay meta CSP ni otras cabeceras de seguridad declaradas. En la raíz del repositorio revisada no se encontró `vercel.json` ni un archivo de configuración de cabeceras equivalente. `vite.config.ts` solo configura React y la ruta base. La función API del catálogo sí establece `X-Content-Type-Options: nosniff`, pero esa cabecera protege esa respuesta y no acredita que el documento principal y los assets tengan una política global.

**Severidad:** media como oportunidad de defensa en profundidad frente a XSS, clickjacking y carga de recursos no autorizados. Esta revisión del repositorio no confirma las cabeceras que Vercel u otra capa de infraestructura pueda añadir automáticamente; deben verificarse en las respuestas HTTP reales antes de concluir que faltan en producción.

**Corrección recomendada:** comprobar cabeceras del dominio desplegado y después definir una política CSP compatible con Supabase y los recursos reales; añadir al menos `frame-ancestors` mediante CSP o `X-Frame-Options`, `Referrer-Policy`, `X-Content-Type-Options` y una política de permisos apropiada. Aplicar HSTS solo tras confirmar HTTPS en todos los subdominios relevantes. No activar una CSP restrictiva sin probar login, recuperación de contraseña, imágenes y llamadas de Supabase.

**Estado:** hallazgos de revisión estática; no se alteraron políticas, grants, roles, funciones, datos, cabeceras del dominio ni configuración de Vercel.


## CASH-05 — Operaciones de venta, compra e inventario no son transacciones atómicas

La revisión de `src/hooks/useErpState.ts` confirma que ventas, edición de facturas, recepción de compras, ajustes de inventario y devoluciones actualizan varias colecciones locales y dependen después del guardado del snapshot. El cliente puede recibir éxito local antes de la confirmación remota de todos los cambios relacionados. El control de revisión del snapshot no convierte estas operaciones en transacciones.

**Severidad:** alta para integridad de inventario y finanzas. No demuestra pérdida de datos; identifica el riesgo de sincronización parcial.

**Resolución requerida:** funciones transaccionales de servidor con autorización por acción, validación de importes y cantidades, idempotencia y restricciones únicas. La interfaz solo debe confirmar después de la respuesta del servidor. No se implementa una solución parcial en el navegador.

## API-01 — Respuestas de error administrativas exponían detalles internos

`api/admin-users.ts` devolvía `error.message` en errores inesperados. Se cambió a una respuesta genérica y se conserva el detalle únicamente en el registro del servidor. Cambio en commit `d159671fa79af5c3f644b921a33a17276b7e4ffc`.

## API-02 — El catálogo público exponía código y estado HTTP del proveedor

`api/store-catalog.ts` incluía el código y estado HTTP de Supabase en la respuesta pública de error. Se retiraron esos campos; el detalle permanece en el registro del servidor. Cambio en commit `370cbe2ea9345bd722a620e761f8008661b3bfd4`.

**Verificación:** los dos archivos fueron releídos en la rama y muestran las respuestas genéricas esperadas. Aún falta CI/build y prueba HTTP; no se declara validación desplegada.


## ADMIN-14 — Mensajes de error del proveedor en la API de usuarios

La revisión completa de `api/admin-users.ts` encontró varias ramas que devolvían `error.message` directamente para bootstrap, creación, invitación, cambio de contraseña y actualización de usuarios. Se reemplazaron por mensajes genéricos y el detalle se envía a los registros del servidor. El `catch` general ya aplicaba este criterio. Commit: `6f690e892ba24f003c614d57416842a19f93adfa`.

## ADMIN-15 — Bootstrap inicial y último administrador: condición de carrera pendiente

El bootstrap comprueba que no haya administradores y luego actualiza el usuario en una segunda operación. Dos solicitudes concurrentes pueden superar la comprobación antes de que cualquiera actualice sus claims. Del mismo modo, la protección del último administrador cuenta usuarios y luego actualiza la cuenta en llamadas separadas. No existe bloqueo/transacción compartida que haga atómica esa secuencia.

**Severidad:** alta para gobierno de cuentas. La comprobación actual funciona en secuencia normal, pero no elimina carreras concurrentes.

**Resolución requerida:** operación transaccional/serializada del lado servidor con restricción que garantice un único administrador activo y que impida quitar el último. No se intenta simular un bloqueo en memoria de una función serverless.

## SESSION-02 — Caché local de datos empresariales después del cierre de sesión

`AuthGate.signOut` cierra la sesión de Supabase y actualiza el estado React, pero no limpia las claves locales de FARMI. El snapshot contiene información de ventas, clientes, compras, costos y cuentas. Los datos pueden permanecer en el navegador después de cerrar sesión.

**Severidad:** alta en dispositivos compartidos. El almacenamiento local no está cifrado y el cierre de sesión no equivale a borrar los datos locales.

**Resolución requerida:** primero garantizar que no haya sincronizaciones pendientes; después limpiar el conjunto exacto de claves del ERP y el identificador de propietario en el cierre de sesión, y bloquear la hidratación de cachés sin propietario. No se borran claves automáticamente en esta auditoría para evitar pérdida de datos pendientes.

## PLATFORM-04 — Cabeceras HTTP globales no configuradas en el repositorio

No se encontró un `vercel.json` ni una configuración equivalente de cabeceras globales en la raíz revisada. Esto no demuestra que las cabeceras falten en el dominio desplegado: Vercel o una capa externa pueden configurarlas. La verificación requiere inspeccionar la respuesta HTTP del despliegue concreto.

**Estado:** no confirmado en producción/Preview; comprobar CSP, HSTS, frame-ancestors/X-Frame-Options, Referrer-Policy y Permissions-Policy antes de cerrar.

## Estado de pruebas y despliegue

El commit `2690bac011ace3b9131fd084cf3e435311d9a214` pasó `npm run build` y `npm test` en GitHub Actions. No hay despliegue Vercel asociado a ese SHA. Los cambios posteriores requieren una nueva ejecución CI y no se consideran publicados.
