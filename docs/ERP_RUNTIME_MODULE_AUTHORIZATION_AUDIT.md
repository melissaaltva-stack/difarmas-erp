# Auditoría de autorización en tiempo de ejecución — FARMI

Rama: `security/erp-state-permission-matrix`  
Archivos revisados: `src/App.tsx`, `src/services/remoteErpState.ts`, `src/services/supabaseClient.ts`, `api/admin-users.ts` y migración RLS `202611020001_erp_state_role_write_guard.sql`.  
Tipo de revisión: estática; no se ejecutaron pruebas contra Supabase ni se modificó la aplicación.

## Hallazgo AUTHZ-01 — Los permisos de módulo se aplican principalmente en la interfaz

**Severidad: alta si se consideran una barrera de seguridad.**

En `src/App.tsx`, `canSee` consulta `farmi_permissions` para filtrar la navegación y `activeAllowed` para impedir que se renderice un módulo no autorizado. Esto mejora la experiencia de usuario, pero los controles están en el cliente.

El mismo componente instancia y pasa callbacks de escritura a módulos, por ejemplo `recordSale`, `saveProduct`, `receivePurchase`, `setExpenses`, `setReceivables`, `setPayables` y `setPaymentTransactions`. En el código revisado no se ve una autorización central por operación en el servidor que vuelva a validar el permiso de módulo antes de aceptar cada cambio.

La persistencia usa el cliente Supabase con la clave pública, y las políticas RLS descritas en la migración revisada controlan propietario, estado activo y rol general de escritura; no verifican cada permiso de módulo ni el tipo de dato que cambia.

**Impacto:** un usuario con sesión válida y rol que supera la política RLS podría intentar modificar la fila `erp_state` por una ruta distinta de la interfaz normal. Ocultar un botón o impedir abrir una pantalla no evita una solicitud directa a Supabase.

**Recomendación:** tratar los permisos de interfaz como controles de presentación. Para seguridad efectiva, trasladar las operaciones sensibles a RPC/funciones transaccionales con autorización server-side por acción, validación de propiedad y reglas de negocio. Separar las operaciones de ventas, compras, inventario, finanzas y configuración. No basta con añadir otra comprobación React.

## Hallazgo AUTHZ-02 — El modelo de persistencia acepta un snapshot completo desde el cliente

**Severidad: alta para integridad de datos.**

En `remoteErpState.ts`, `saveErpSnapshotNow` envía el objeto `snapshot` completo en `state` mediante INSERT o UPDATE. La comprobación de `updated_at` ayuda a detectar escrituras concurrentes, pero no valida que el usuario tenga permiso para cambiar cada campo ni que los datos cumplan las reglas de negocio.

La función `normalizeSnapshot` valida principalmente que determinados campos sean arreglos y que dos valores numéricos sean finitos. No valida todas las propiedades internas, relaciones entre registros, importes derivados ni transiciones permitidas.

**Impacto:** la política RLS de fila no puede distinguir qué subcampos JSONB fueron modificados. Un usuario autorizado a escribir la fila podría alterar otros módulos incluidos en el mismo snapshot.

**Recomendación:** sustituir gradualmente la escritura de snapshot completo por operaciones específicas de dominio, con validación en base de datos y transacciones. Mantener el control de revisión como protección adicional contra concurrencia, no como autorización.

## Controles positivos observados

- El cliente utiliza `VITE_SUPABASE_PUBLISHABLE_KEY`, no una clave de servicio.
- El servicio de guardado utiliza INSERT para el primer snapshot y no un UPSERT que pueda reemplazar una fila creada concurrentemente.
- Las actualizaciones usan la revisión `updated_at` esperada y rechazan conflictos.
- La carga comprueba que el `user_id` devuelto coincida con el usuario solicitado.
- Los tests existentes cubren conflictos de revisión, propiedad de cuenta y algunos datos malformados.

## Plan de corrección seguro

1. Mantener los permisos de interfaz para navegación, sin considerarlos autorización.
2. Definir matriz de acciones servidor-side por rol y módulo.
3. Diseñar RPC transaccionales por operación; no exponer una RPC genérica que acepte cualquier snapshot.
4. Validar importes, IDs, propiedad, existencias, saldos y transiciones en servidor/base de datos.
5. Probar con cuentas de cada rol en staging, incluyendo solicitudes directas que omitan la interfaz.
6. Migrar gradualmente sin borrar ni reemplazar el snapshot existente; mantener respaldo y plan de reversión.

**No aplicar una migración RLS restrictiva todavía:** primero se debe inventariar la base de datos real, las cuentas y las escrituras que hoy dependen del snapshot completo para evitar bloquear a la administración o interrumpir el ERP.

## Verificación de base activa — solo lectura

**Proyecto consultado:** `nreumomoqiwgqbtnhbdy`. Se ejecutaron únicamente consultas SELECT de catálogos y la lectura de Security Advisors. No se aplicaron migraciones, no se ejecutó DDL/DML y no se consultaron valores de negocio.

### AUTHZ-LIVE-01 — RLS habilitado, pero no forzado

El catálogo de PostgreSQL confirma que RLS está habilitado en `public.erp_state` y `public.store_products`, pero `FORCE ROW LEVEL SECURITY` está desactivado en ambas tablas. Esto no elimina las policies para los usuarios normales, pero el propietario de la tabla y roles con bypass RLS pueden no quedar sujetos a ellas. Debe revisarse quién es el propietario y qué rol usa cada operación privilegiada.

### AUTHZ-LIVE-02 — La policy activa de erp_state acepta claim activo ausente

Las policies actualmente activas `erp_state_select_own`, `erp_state_insert_own` y `erp_state_update_own` usan `COALESCE(farmi_active, true)`. Por tanto, si el claim `farmi_active` falta, se interpreta como activo. INSERT y UPDATE además admiten los roles Administrador, Supervisor, Ventas, Compras y Finanzas. No existe una condición de `farmi_permissions` por módulo en estas policies.

**Severidad: alta.** Esto confirma en la base activa la discrepancia de autorización identificada estáticamente. No se cambió la policy porque endurecerla sin inventario de sesiones/cuentas podría bloquear usuarios legítimos.

### AUTHZ-LIVE-03 — Función de nota de crédito no está instalada en el proyecto consultado

La consulta al catálogo `pg_proc` no devolvió `public.resolve_supplier_credit_note(bigint)`. La función sí existe como SQL en el repositorio, pero no está presente en la base consultada; por ello, no debe considerarse una protección operativa activa ni afirmarse que esa ruta transaccional está disponible en producción.

La herramienta de historial de migraciones devolvió una lista vacía. Esto no demuestra por sí solo que no haya habido cambios manuales, pero sí significa que no hay migraciones registradas en esa respuesta que permitan acreditar la aplicación de esta función.

### STORE-LIVE-01 — Grants de escritura redundantes en store_products

El catálogo de privilegios muestra grants INSERT, UPDATE y DELETE para `anon` y `authenticated` sobre `public.store_products`. La policy RLS observada para esos roles es únicamente SELECT con `is_published = true`; no se observó una policy de escritura para esos roles. Por tanto, los grants no prueban por sí mismos que puedan escribir mientras RLS siga activo, pero son privilegios innecesarios y una exposición de defensa en profundidad.

**Recomendación:** verificar primero el flujo administrativo y luego revocar esos grants a `anon` y `authenticated` en una migración controlada, conservando SELECT público y la policy de productos publicados.

### AUTH-LIVE-01 — Advertencia de seguridad Auth

El Security Advisor devuelve `auth_leaked_password_protection`: la protección contra contraseñas filtradas está deshabilitada. Se recomienda habilitarla desde la configuración de Auth si el plan y la configuración del proyecto lo permiten. No se modificó la configuración.

### Alcance y limitaciones

- La consulta confirmó las policies, grants y flags RLS vigentes en el momento de la revisión.
- No se probaron escrituras con cuentas de cada rol ni se intentó evadir RLS.
- No se inspeccionó ni cambió contenido de filas `erp_state`.
- No se aplicó la migración de nota de crédito ni la migración restrictiva de permisos.
- La revisión no certifica la seguridad de roles privilegiados, propietarios, backups ni configuración de red; requiere una fase específica de validación en staging.


### CREDIT-RPC-01 — Desajuste de rol y permiso en la migración preparada

La revisión de `src/domain/types.ts`, `src/components/SupplierReturns.tsx` y `supabase/migrations/202611020002_supplier_credit_note_atomic.sql` encontró que el RPC permite el rol Finanzas, pero exige el permiso `compras`. La matriz de permisos de `api/admin-users.ts` no concede `compras` al rol Finanzas. En consecuencia, ese rol no podrá completar la operación aunque aparezca en la lista de roles permitidos. La migración requiere corregir esa discrepancia antes de aplicarse.

### CREDIT-RPC-02 — El importe del crédito todavía procede de datos editables por cliente

El RPC usa `totalCost` y los detalles de devolución almacenados en el snapshot como base del crédito. Esos valores proceden de un estado editable por cliente y no se recalculan dentro de la función contra las líneas originales de `purchaseCostHistory`. Antes de aplicar el RPC debe recalcular el importe usando el historial de costo de la compra, validar productos y cantidades devueltas, y comprobar que no excedan las cantidades compradas netas de devoluciones previas. Hasta entonces, la transacción evita duplicados/concurrencia, pero no garantiza por sí sola la integridad del importe.

### MIGRATION-01 — Inventario de cuentas no acreditado

El comentario de la migración `202611020001_erp_state_role_write_guard.sql` afirma que todas las cuentas existentes fueron inventariadas y tienen `farmi_active=true`. Esta auditoría aún no obtuvo esa evidencia completa. La condición fail-closed está preparada, pero debe probarse con cuentas y sesiones reales antes de aplicarse.


### Correcciones de revisión incorporadas a la rama

- La migración `202611020002_supplier_credit_note_atomic.sql` ya no incluye Finanzas como rol autorizado para esta operación: la función exige el permiso `compras`, que la matriz de Finanzas no concede.
- La migración `202611020001_erp_state_role_write_guard.sql` ya no afirma que el inventario de cuentas y sesiones fue completado; exige completar esa verificación antes de aplicarse.
- Estas correcciones están en la rama de seguridad, no en la base activa.
- El RPC de nota de crédito sigue pendiente de una corrección de integridad: recalcular importes y cantidades contra `purchaseCostHistory` y devoluciones anteriores.


### AUTHZ-LIVE-04 — Propiedad, roles privilegiados y funciones SECURITY DEFINER

La consulta de catálogos confirma que public.erp_state y public.store_products pertenecen a postgres; RLS está habilitado, pero no forzado. Los roles anon y authenticated no tienen atributos BYPASSRLS ni superusuario. service_role tiene BYPASSRLS, como corresponde al rol privilegiado de Supabase; supabase_admin es superusuario. Por tanto, las policies no deben considerarse protección frente a claves privilegiadas comprometidas.

La inspección de pg_proc no encontró funciones SECURITY DEFINER en el esquema public en el momento de la consulta. Esto reduce la superficie de funciones privilegiadas públicas, pero no sustituye la auditoría de otros esquemas ni de funciones Edge/API.

La membresía observada confirma que authenticator puede asumir los roles de API anon, authenticated y service_role; esto es parte del modelo de conexión de Supabase y no significa que un usuario final pueda elegir libremente service_role. La clave de servicio debe permanecer exclusivamente en el servidor.

### STORE-LIVE-02 — Grants de escritura redundantes confirmados

La nueva consulta confirmó que anon y authenticated conservan INSERT, UPDATE y DELETE sobre store_products, mientras que la única policy observada para esos roles es SELECT de productos publicados. RLS bloquea esas escrituras mientras permanezca activa la configuración actual, pero los grants no son necesarios para el acceso público de lectura. La revocación debe prepararse como migración separada y validar primero que el administrador de catálogo escribe exclusivamente desde la API con service role. No se modificaron grants activos.

### SUPRET-09 — Cambio recibido se registra desde el cliente y no es atómico

La revisión de useErpState.ts confirma que el flujo Cambio recibido calcula nuevas existencias y costo promedio en el navegador y después actualiza productos, movimientos de inventario y estado de devolución mediante setters separados. No hay transacción de base de datos ni bloqueo compartido entre dispositivos para esta transición. El control supplierReturnResolutionInProgress es local a la sesión.

Severidad: alta para integridad de inventario. Una interrupción o dos sesiones concurrentes pueden dejar el cambio recibido aplicado parcialmente o duplicar la reposición. Debe trasladarse a una operación transaccional que valide estado, cantidades enviadas, productos y costos contra el registro original antes de modificar inventario y movimiento.

### SUPRET-10 — Rechazo también se confirma únicamente en el cliente

El estado Rechazado se actualiza con setSupplierReturns sin operación transaccional en servidor ni evidencia de quién rechazó, cuándo o por qué. Aunque no altera inventario ni cuentas por pagar, no ofrece trazabilidad resistente a modificaciones ni una transición consistente entre dispositivos. Debe registrarse como evento server-side con actor, fecha, motivo y transición de estado validada.

### CREDIT-RPC-03 — La función transaccional aún no valida cantidades contra historial de compra

La UI obtiene el costo unitario desde purchaseCostHistory, pero el RPC preparado vuelve a tomar totalCost y items desde el snapshot. El tipo PurchaseRecord solo contiene cabecera, mientras que PurchaseCostHistoryEntry contiene purchaseId, productId, unitCost y quantity. Por ello, existe una fuente de detalle apta para validación, pero la función todavía no la utiliza para recalcular el crédito ni para sumar devoluciones previas por producto.

Corrección requerida antes de aplicar: para cada producto devuelto, validar que exista en el historial de la compra, sumar cantidades previamente devueltas no rechazadas, impedir que la suma supere la cantidad comprada, recalcular el costo desde historial y derivar el importe del servidor. Rechazar cantidades negativas, costos ausentes, duplicados y estados distintos de Enviado al proveedor. No se debe confiar en el importe enviado por el navegador.

### Alcance de esta ronda

Las consultas adicionales fueron exclusivamente de catálogo (pg_class, pg_roles, pg_auth_members, pg_policies, pg_proc e información de privilegios). No se leyeron filas de negocio ni se ejecutó DDL/DML. No se modificaron políticas, grants, funciones, usuarios ni configuración de Auth.


### SUPRET-11 — Despacho de devolución también modifica existencias desde el cliente

La inspección de `recordSupplierDispatch` en `src/hooks/useErpState.ts` confirma que el despacho descuenta stock, crea movimientos de inventario y depende de un bloqueo `useRef` local. No valida en servidor que la devolución siga Pendiente ni que otra sesión no haya despachado ya las mismas unidades. Además, el cambio de existencias y el movimiento se guardan como partes del snapshot completo, no como una única transacción de negocio.

**Severidad: crítica para integridad de existencias.** Dos sesiones pueden despachar la misma devolución o una escritura posterior del snapshot puede reemplazar el estado de otra sesión. El arreglo debe ser una única RPC transaccional e idempotente que bloquee la fila `erp_state`, vuelva a leer la devolución y productos actuales, valide cantidades y estado Pendiente, descuente stock y agregue movimientos antes de confirmar.

### SUPRET-12 — La RPC de nota de crédito es invoker, pero aún confía en datos del snapshot

Se inspeccionó el SQL completo de `resolve_supplier_credit_note(bigint)`. La función está declarada `SECURITY INVOKER`, fija `search_path` y revoca ejecución a `PUBLIC` y `anon`, concediéndola a `authenticated`; el row lock y la transición de estado reducen duplicados concurrentes para esa operación concreta. La validación de rol y permiso `compras` también se realiza dentro de la función.

Sin embargo, `v_note` se obtiene directamente de `supplierReturns[].totalCost`. La función localiza la compra por proveedor y referencia, pero no consulta `purchaseCostHistory` ni valida que las cantidades devueltas acumuladas no excedan las cantidades recibidas. Por tanto, la atomicidad no garantiza que el importe ni las cantidades sean correctos. No aplicar esta migración todavía.

### SUPRET-13 — La transición de rechazo no persiste evidencia verificable

La función cliente `resolveSupplierReturn` cambia el estado a Rechazado mediante `setSupplierReturns` y no exige motivo ni actor. Esta transición requiere una operación de servidor con validación de estado, actor autenticado y motivo obligatorio, con evento auditable.

### Estado de implementación

No se cambió código funcional ni se aplicó ninguna migración. Las correcciones anteriores requieren diseñar las RPC para despacho, cambio recibido y rechazo, y fortalecer la RPC de nota de crédito usando los datos originales de compra y el historial de devoluciones. Evitar desplegar estas operaciones hasta contar con pruebas de concurrencia, reintentos, doble envío y rollback.


### SALES-12 — Registro de venta, inventario y cuentas por cobrar no es transaccional

La revisión de `recordSale` en `src/hooks/useErpState.ts` confirma que la venta se valida y construye en el navegador, y luego se actualizan por separado productos, movimientos de inventario, ventas y cuentas por cobrar. `saleInProgress` y la comprobación de número de factura duplicado son locales a la sesión; no existe una reserva ni restricción única compartida entre dispositivos. Los importes, impuestos, descuentos, costo y cantidades de `CartItem`/`StandardInvoiceDetails` llegan desde el cliente y no se recalculan en un servidor de confianza.

**Severidad: crítica para integridad contable y de inventario.** Una carrera entre dispositivos puede vender las mismas existencias, duplicar una factura o dejar una venta sin su movimiento/cuenta por cobrar. La solución requiere una operación transaccional de servidor con idempotency key, bloqueo de fila, validación de existencias y precios/costos contra el catálogo actual, cálculo fiscal en servidor y escritura conjunta de venta, movimientos, stock y cuenta por cobrar. La numeración fiscal también debe validarse con los parámetros de autorización configurados antes de emitir.

### REFUND-09 — Ajustes de venta dependen de importes y costos suministrados por el cliente

`recordSaleAdjustment` comprueba consistencia aritmética básica y cantidades pendientes usando el historial del snapshot, pero toma `unitPrice`, `unitTaxAmount` y `unitCost` del objeto de ajuste recibido del cliente. Luego actualiza por separado inventario, movimientos, cuentas por cobrar, movimientos de caja y ajustes de venta. `saleAdjustmentInProgress` solo impide concurrencia dentro de una instancia.

**Severidad: crítica.** Un usuario o cliente modificado puede alterar los importes reembolsados, el costo usado para valorar el inventario o las cantidades devueltas; dos sesiones pueden procesar ajustes concurrentes sobre la misma venta. Debe sustituirse por una RPC transaccional que obtenga líneas originales de la venta, derive precios/impuestos/costos desde esos registros, valide cantidades devueltas acumuladas por `saleLineId`, impida superar cantidades vendidas, aplique reglas de devolución de stock por línea y actualice simultáneamente saldo, reembolso, caja e inventario.

### INV-09 — Edición manual de existencias y eliminación física sin autorización de servidor

`saveProduct` permite cambiar directamente `stock` y crea un movimiento descriptivo desde el cliente; `deleteProduct` elimina físicamente el producto del snapshot y registra un ajuste de salida si tenía stock. No existe evidencia de actor, motivo obligatorio, aprobador ni protección contra referencias históricas. La edición no está respaldada por una transacción de inventario.

**Severidad: alta.** Se recomienda reemplazar cambios manuales de stock por ajustes transaccionales con motivo, actor y aprobación según umbral; los productos referenciados por ventas/compras/movimientos deben archivarse, no borrarse físicamente. Mantener la compatibilidad de lectura de registros históricos.

### PUR-08 — Recepción de compra aplica varios efectos separados

`receivePurchase` modifica stock y movimientos, crea la cabecera de compra, aplica créditos de proveedor, añade historial de costo y puede crear cuenta por pagar mediante setters separados. La clave de factura duplicada y `purchaseInProgress` se validan localmente. El total ingresado puede sustituir el total calculado de líneas sin reconciliación en esta función.

**Severidad: crítica para integridad de compras.** Se confirma que el proceso no es atómico ni idempotente entre dispositivos. La RPC de recepción debe verificar proveedor/factura, detalle de líneas, cantidades, costos, impuestos, total y crédito disponible; crear compra, historial de costos, movimientos, existencias y cuenta por pagar en una única transacción con clave de idempotencia.

### Prioridad de remediación consolidada

1. Operaciones de servidor transaccionales para venta, recepción de compra, devolución/ajuste de venta y devolución a proveedor.
2. Idempotencia y unicidad de documento/factura en base de datos, no en `useRef`.
3. Recalcular importes, impuestos, costos y cantidades desde registros originales; nunca confiar en importes del cliente.
4. Auditoría inmutable de actor, fecha, motivo, aprobador y referencias de movimientos.
5. Migrar gradualmente sin cambiar el formato del snapshot hasta contar con pruebas de compatibilidad, concurrencia, rollback y recuperación.

No se modificó código funcional ni se ejecutaron migraciones. Los hallazgos se basan en lectura de código y no constituyen una prueba dinámica de explotación.


### STORE-01 — El catálogo público usa `active` como único filtro de publicación

Revisión de `api/store-catalog.ts` (SHA `b3f776147de3de0dd3a1625fd89bcc0297b9516e`): el endpoint es solo GET, responde `no-store`, usa clave de servidor, consulta una fila concreta por `FARMI_STORE_CATALOG_USER_ID` y devuelve una lista explícita de campos públicos; no expone el snapshot completo ni costo, existencia, lote, vencimiento o proveedor. Estos son controles positivos.

Sin embargo, `publicProduct` excluye únicamente cuando `product.active === false`. Por tanto, los registros con `active: true` y también aquellos sin la propiedad `active` quedan incluidos automáticamente. No hay una condición de publicación explícita ni allowlist de productos autorizados para la tienda. Si `active` representa que el producto está activo en el ERP y no que fue aprobado para venta pública, el catálogo puede mostrar productos que no se han autorizado para la tienda.

**Severidad: media (confidencialidad comercial/publicación).** Antes de corregir, confirmar el contrato funcional del catálogo. Recomendación: introducir un estado explícito `storePublished === true` o una lista de publicación administrada, con denegación por defecto; preservar el catálogo actual solo si el negocio confirma que todo producto activo debe publicarse. Probar también registros antiguos sin el nuevo campo. La clave privilegiada permanece del lado servidor en el código revisado; verificar en despliegue que no exista prefijo `VITE_` para secretos y que `FARMI_STORE_CATALOG_USER_ID` apunte a la cuenta correcta.


### AUTHZ-11 — Los permisos de módulo solo se aplican en navegación/UI; el snapshot completo se escribe con el permiso de fila

Confirmado al cruzar `src/App.tsx` (SHA `1a26c9a65fae23495c84188c6c132923cd68fc98`) y `src/services/remoteErpState.ts` (SHA `d8bb099d16c94af9a9902bb6109f729e05117c3c`): `canSee()` y `activeAllowed` controlan qué secciones presenta la interfaz, pero el guardado general envía el objeto `ErpSnapshot` completo mediante `UPDATE public.erp_state ... WHERE user_id = auth.uid() AND updated_at = expectedRevision`. La revisión de RLS documentada previamente confirma que las políticas filtran por propietario/estado de cuenta/rol, pero no autorizan cada módulo ni restringen columnas/campos del JSON. Por tanto, un usuario con sesión y acceso a la fila puede intentar escribir directamente campos de módulos que la interfaz le oculta; el control visual no constituye una frontera de seguridad.

**Severidad: crítica (autorización horizontal dentro de la cuenta).** La solución no es añadir más condicionales React: se necesita autorización del lado servidor para cada operación de negocio. Mientras el snapshot monolítico siga siendo el almacenamiento, un simple `UPDATE` de la fila no puede demostrar qué submódulos fueron autorizados ni distinguir un cambio legítimo de un campo de otro módulo. La migración segura debe ser gradual: RPCs/API transaccionales con permisos derivados de claims verificados en servidor para operaciones críticas y, en una fase posterior, separar dominios o aplicar validación de cambios por campo. No revocar de inmediato el UPDATE actual sin un plan de transición porque podría bloquear el autosave de la aplicación.

### AUTHZ-12 — La política de fila permite interpretar un claim de activación ausente como activo

La consulta de políticas RLS de `erp_state` realizada en la auditoría previa mostró `COALESCE((auth.jwt()->'app_metadata')->>'farmi_active' ... , true)`: cuando el claim no existe, el fallback es `true`. En contraste, `api/admin-users.ts` exige `farmi_active === true` para operaciones administrativas (excepto la ruta específica de bootstrap), y `App.tsx` solo habilita secciones cuando `userAccess.active === true`. Esta diferencia entre capas permite que una sesión con claim ausente no sea tratada uniformemente como desactivada por la base de datos, aunque la interfaz no muestre módulos.

**Severidad: alta.** Cambiar el criterio a denegación por defecto (`farmi_active` debe existir y ser exactamente `true`) requiere validar primero el estado de todos los usuarios y el proceso de refresco de tokens. No aplicar directamente en producción: una política más estricta sin migración de claims podría cortar acceso legítimo y sincronización.

### Conclusión de autorización

El control de roles en `admin-users.ts` y el ocultamiento de navegación son controles útiles, pero no resuelven la autorización de mutaciones del ERP. La principal brecha es la combinación de permisos de módulo en cliente con escritura directa de un snapshot JSON completo. Esta arquitectura no permite certificar aislamiento entre módulos ni integridad de las operaciones de negocio. La remediación debe priorizar endpoints/RPCs con autorización y transacciones en servidor, después de pruebas con cuentas de cada rol.


### FIN-06 — Cobros de clientes y pagos a proveedores no son transacciones atómicas

La revisión de `src/components/Finance.tsx` (SHA `556a4e667e1c336f0055a8a7de96a5240ba3d363`) confirma que `collect` actualiza el saldo de `receivables` y añade por separado una fila a `paymentTransactions`; `paySupplier` hace lo mismo con `payables`. El importe se valida en el cliente contra el saldo visible y el bloqueo `paymentLocks` es un `useRef` local que además se limpia al cambiar los arreglos de estado. No hay idempotencia, bloqueo compartido ni transacción de servidor.

**Severidad: crítica para saldos y trazabilidad.** Dos sesiones pueden registrar abonos concurrentes contra el mismo saldo o guardar solo una parte de la operación. Reemplazar por RPC transaccional que bloquee la cuenta, vuelva a calcular saldo, valide importe y medio de pago, registre el movimiento con actor y referencia, y aplique una clave de idempotencia única.

### FIN-07 — Los gastos se registran sin evidencia suficiente ni control de aprobación

La función `addExpense` crea un gasto desde el navegador con descripción, monto, categoría, fecha y método de pago, y luego llama `setExpenses`. No exige beneficiario, comprobante, referencia, actor autenticado persistido ni aprobación; tampoco registra el gasto y su efecto de caja como una única operación.

**Severidad: alta.** Definir campos obligatorios según tipo de gasto y umbrales de aprobación; persistir actor, fecha del servidor, motivo, beneficiario y evidencia/referencia. Si el gasto afecta efectivo, crear el gasto y el movimiento de caja en la misma transacción.

### FIN-08 — El cierre diario depende de cálculos y controles del navegador

La función `closeCash` usa los totales calculados en el componente, el saldo inicial y el efectivo contado ingresado por el operador. La prevención de doble cierre (`closingRef` y `alreadyClosedToday`) es local y la fila se añade con `setClosures`; no existe unicidad diaria ni validación transaccional compartida. La cifra esperada se deriva de ventas, cobros, gastos, compras y movimientos que también proceden del snapshot.

**Severidad: alta.** El servidor debe recalcular el corte desde operaciones persistidas, bloquear el periodo/caja, imponer unicidad por caja y fecha, registrar apertura, conteo, diferencia, usuario y confirmación. El cierre debe ser inmutable; las correcciones posteriores deben ser ajustes auditados, no edición del cierre original.

### FIN-09 — Los movimientos manuales de caja carecen de autoría y evidencia

El formulario de movimientos manuales crea entradas/salidas con tipo, descripción, monto, categoría y fecha local mediante `addCashMovement`, y actualiza el arreglo completo desde el cliente. No requiere motivo estructurado, tercero, comprobante, actor, aprobador ni referencia externa; tampoco existe validación de servidor ni idempotencia.

**Severidad: alta.** Crear un endpoint/RPC para movimientos con autorización por rol, validación de categorías y montos, actor y timestamp del servidor, motivo obligatorio, referencia/evidencia y registro inmutable. No aceptar movimientos arbitrarios como sustituto de cobros, pagos o gastos documentados.

### FIN-10 — Los métodos financieros no validan autorización en el servidor

El componente `Finance` recibe setters para gastos, cuentas por cobrar/pagar, cierres, movimientos y transacciones. En el código revisado, las funciones `addExpense`, `collect`, `paySupplier`, `closeCash` y el registro de movimientos no invocan un servicio que autorice la acción en backend; la escritura termina formando parte del snapshot completo señalado en AUTHZ-11. Ocultar una subsección o botón por permisos de módulo no impide que un cliente autenticado intente modificar esos campos directamente.

**Severidad: crítica (autorización e integridad).** La solución debe verificar permisos y estado activo en cada operación del servidor, no confiar en el rol enviado por el cliente, y registrar actor/acción/recurso. Mantener temporalmente la compatibilidad del snapshot para lectura, pero migrar las mutaciones financieras a operaciones de servidor antes de restringir el autosave.

### Alcance de la revisión financiera

Se inspeccionaron las implementaciones de `Finance.tsx` y el estado compartido de `useErpState.ts`. Los hallazgos son de revisión estática del código; no se realizaron pruebas con sesiones simultáneas ni escrituras de negocio. No se modificó código funcional, datos de Supabase, políticas ni migraciones. La corrección completa requiere RPCs transaccionales, pruebas de concurrencia/idempotencia y un plan de compatibilidad del snapshot; no es seguro aplicar un arreglo parcial solo en React.


### AUTHZ-13 — El rol «Solo lectura» hereda acceso a módulos con operaciones de escritura

La revisión cruzada de `api/admin-users.ts` (SHA `6f4a603324c170d2b7b2113b50096b9b732aa870`), `src/components/Settings.tsx` (SHA `41a2801cecb7a9f535ee6bb284a9d049bed0ae26`) y `src/App.tsx` (SHA `1a26c9a65fae23495c84188c6c132923cd68fc98`) confirma que el rol `Solo lectura` recibe permisos de módulos como ventas, inventario, compras, finanzas, cuentas por cobrar y cuentas por pagar. La matriz del servidor y la matriz visual de configuración coinciden en esos permisos. Sin embargo, la autorización de navegación solo verifica que el módulo esté incluido en `permissions`; no existe un indicador de solo lectura ni una política de capacidades de escritura por acción. Las vistas que se montan para esos módulos incluyen controles para registrar ventas, editar productos, recibir compras, registrar cobros/pagos y cambiar datos.

**Severidad: crítica (privilegios excesivos por rol).** El nombre del rol promete una restricción que la aplicación no aplica. No basta con quitar módulos de la navegación: se requiere un modo de capacidades separado (lectura/creación/edición/aprobación) y que tanto UI como servidor lo apliquen. Hasta que exista, no asignar este rol a usuarios que deban tener prohibidas las mutaciones. La corrección completa debe incluir pruebas negativas por cada módulo y llamadas directas a backend; el bloqueo visual no sustituye autorización server-side.

### AUTHZ-14 — La matriz de roles está duplicada entre servidor y cliente

Las listas `ROLE_PERMISSIONS` en `api/admin-users.ts` y `rolePermissions` en `src/components/Settings.tsx` son definiciones independientes. Actualmente las listas observadas para los roles coinciden, pero una modificación futura en una sola capa puede mostrar una matriz distinta a la que realmente emite el servidor. Además, el endpoint `admin-users` valida que los permisos pertenezcan al catálogo global de módulos, pero para roles no administradores permite cualquier subconjunto de ese catálogo; no impone límites máximos por rol. Esto puede ser intencional si se permiten permisos personalizados, pero debe ser explícito y probado, especialmente para «Solo lectura».

**Severidad: media (deriva de configuración y exceso de permisos).** Centralizar el catálogo de roles en un contrato compartido validado por servidor o hacer que el cliente consuma la matriz devuelta por la API. Si se permiten excepciones personalizadas, documentar esa política y distinguir permisos de lectura de capacidades de mutación; no tratar un permiso de módulo como autorización para escribir.

### Alcance de la revisión de roles

Se compararon las matrices de permisos del endpoint administrativo, la configuración de usuarios y el guard de navegación. La revisión es estática: no se crearon cuentas de prueba, no se ejecutaron acciones de negocio con cada rol y no se hicieron solicitudes directas de mutación. No se cambiaron roles, claims, código funcional ni datos de Supabase. La principal corrección pendiente es diseñar y probar capacidades de lectura/escritura en servidor, no cambiar únicamente las listas de navegación.


### AUTHZ-15 — El bootstrap y la protección del último administrador tienen condiciones de carrera

Se revisó el único endpoint administrativo adicional, `api/admin-users.ts` (SHA `6f4a603324c170d2b7b2113b50096b9b732aa870`). El endpoint valida correctamente el access token mediante `auth.getUser(accessToken)`, exige `farmi_active === true` para las acciones privilegiadas y comprueba el rol administrador en servidor. La creación de nombres de usuario también delega la unicidad a `auth.admin.createUser`, que evita la carrera de una comprobación previa.

No obstante, el bootstrap ejecuta `listUsers()`, comprueba que no exista administrador y después actualiza al usuario en una llamada separada. Dos solicitudes simultáneas con el mismo token de bootstrap podrían observar cero administradores y promover cuentas distintas. El control de “último administrador” en `update` tiene el mismo patrón: cuenta administradores y luego actualiza el usuario en otra operación; dos administradores concurrentes podrían desactivar o degradar ambos.

**Severidad: alta (disponibilidad y gobierno de acceso).** La comprobación debe ser atómica en el servidor: una función transaccional con bloqueo/constraint de singleton para el administrador activo, que serialice bootstrap, degradación y desactivación. No se debe intentar resolver solo con un bloqueo en memoria de la función serverless. No se cambió el endpoint ni se alteraron cuentas.

### AUTHZ-16 — Las acciones de administración y el bootstrap no tienen limitación de intentos persistente

En el código completo del endpoint no se observa rate limit, cuota por usuario/IP ni enfriamiento persistente para intentos de bootstrap, creación/invitación, restablecimiento de contraseña o cambios de cuenta. La comparación del token de bootstrap usa `timingSafeEqual`, lo cual es positivo, pero no evita intentos repetidos distribuidos ni el abuso de operaciones administrativas por una cuenta administradora comprometida.

**Severidad: alta para el bootstrap; media para el resto de acciones.** Aplicar límites persistentes en infraestructura compartida, con umbrales diferenciados por acción, registro de intentos fallidos y alertas. No implementar un contador local en memoria porque no coordina instancias serverless. Confirmar además que el secreto de bootstrap tenga alta entropía, esté configurado solo en variables de servidor y se rote/elimine después de la activación inicial. No se expusieron ni modificaron secretos.

### Revisión del inventario de endpoints y cobertura de pruebas

Se enumeró el directorio `api/` de la rama `security/erp-state-permission-matrix`: contiene dos endpoints desplegables (`admin-users.ts` y `store-catalog.ts`) y una suite (`admin-users.test.ts`). No se encontraron otras rutas en ese directorio. `admin-users.ts` verifica la identidad con Supabase Auth y aplica autorización administrativa en backend; no confía en un rol enviado por el cliente. `store-catalog.ts` es GET de solo lectura, fija `no-store`, mantiene las claves privilegiadas en variables de servidor y proyecta una allowlist de campos públicos. Permanece el riesgo de publicación por defecto documentado como STORE-01.

La suite de `admin-users.test.ts` cubre estado propio, ausencia/token inválido, unicidad de nombre y denegación de algunas acciones a no administradores o cuentas sin claim activo. No cubre bootstrap concurrente, carrera del último administrador, rate limiting, reset-password/update, límites de tamaño de petición, ni escenarios de permisos personalizados. La inspección fue estática y de tests existentes; no se ejecutó una batería dinámica contra despliegue ni se hicieron llamadas de escritura a Supabase.

No se modificó código funcional, configuración, secretos, cuentas ni datos de Supabase. No se aplicó ninguna migración. Los riesgos AUTHZ-15 y AUTHZ-16 requieren una solución coordinada del lado servidor y pruebas de concurrencia/abuso antes de desplegar.


### SUPPLY-01 — Dependencias sin versiones reproducibles y CI instala con `npm install`

La inspección de `package.json` (SHA `3b1d0618990b1ffc73a9d158b8e43aa91bb52e5f`) encontró dependencias principales declaradas como `latest` (Vite, React, TypeScript, plugin React y tipos React), sin que el directorio raíz muestre un lockfile npm. Los workflows `.github/workflows/ci.yml` (SHA `6026e790c0587d17b207aa718a95d84d0bcaf452`) y `deploy-pages.yml` (SHA `9aad1c6bc7b183f26b7e061b50b54ed1adc7d563`) instalan con `npm install`, no `npm ci`. Por tanto, dos ejecuciones pueden resolver versiones distintas sin cambios en Git, y la revisión de seguridad del árbol de dependencias no es reproducible.

**Severidad: alta (riesgo de cadena de suministro y reproducibilidad).** Fijar versiones directas, generar y versionar el lockfile, cambiar CI a `npm ci` y revisar/actualizar dependencias mediante PR controlado. Complementar con auditoría de dependencias y actualización periódica. No se ejecutó instalación ni se cambiaron paquetes en esta revisión.

### SUPPLY-02 — Workflows de GitHub Actions no fijan las acciones externas por SHA

Los workflows revisados utilizan acciones de terceros/Marketplace mediante etiquetas de versión (`actions/checkout@v4`, `actions/setup-node@v4`, `actions/upload-pages-artifact@v3`, `actions/deploy-pages@v4`) y el workflow CI no declara explícitamente un bloque `permissions` mínimo a nivel de workflow/job. Las etiquetas pueden avanzar a otra revisión y los permisos efectivos dependen de la configuración predeterminada del repositorio.

**Severidad: media.** Fijar las acciones a SHA completos verificados, añadir comentarios con la versión semántica, y declarar permisos mínimos por job (por ejemplo, solo `contents: read` para build/test; Pages requiere los permisos específicos ya declarados en su workflow). Revisar también protección de ramas y aprobación de cambios de workflows. No se modificaron workflows ni configuración del repositorio.

### Configuración de build y despliegue — observaciones

`.env.example` solo documenta URL y publishable key de Supabase; no contiene secretos privilegiados, lo cual es correcto. `vite.config.ts` usa base `/` en Vercel y `/difarmas-erp/` en GitHub Pages para rutas de assets. El workflow de Pages valida la presencia de las dos variables públicas antes del build. La inspección del directorio raíz no mostró `vercel.json` ni un archivo equivalente de cabeceras; no se debe asumir que faltan cabeceras en producción sin comprobar la configuración efectiva de Vercel. La siguiente revisión debe verificar CSP, HSTS, nosniff, referrer-policy, frame-ancestors y permisos de navegador desde la configuración real del deployment.

No se ejecutaron workflows ni despliegues. La auditoría de dependencias en CI puede detectar vulnerabilidades, pero su resultado debe revisarse en la ejecución correspondiente; no se infiere el estado de paquetes a partir de este análisis estático.


### DEPLOY-01 — No se pudo verificar la protección de la rama principal con los permisos disponibles

La consulta de reglasets del repositorio devolvió una lista vacía (`[]`). La consulta de protección de `main` respondió HTTP 403 `Resource not accessible by integration`; por tanto, esta integración no puede confirmar si existen reglas de protección clásicas, revisiones obligatorias, restricciones de push o checks requeridos. No se debe interpretar el 403 como ausencia de protección. Se requiere revisión por un propietario del repositorio en Settings → Branches / Rulesets, verificando protección de `main`, restricción de force-push/deletion, PR obligatorio, revisiones, CODEOWNERS y checks de CI.

**Severidad: pendiente de verificación.** No se modificaron reglas ni permisos del repositorio.

### DEPLOY-02 — La configuración de protección de Vercel no equivale a autenticación del ERP

La lectura del proyecto Vercel `difarmas-erp` identificó SSO Protection habilitado con `all_except_custom_domains`, Password Protection deshabilitado y Trusted IPs deshabilitado. El proyecto lista como dominio asociado `difarmas-erp.vercel.app` (verificado). Esta protección de deployment no reemplaza el login de FARMI ni los controles de autorización en Supabase/API. Además, la excepción de dominios personalizados debe revisarse si en el futuro se agregan dominios propios; la consulta actual no mostró ninguno.

**Severidad: media (configuración de acceso y riesgo de interpretación).** Mantener la autenticación de aplicación obligatoria y probarla en cada dominio; evaluar una política de protección explícita para previews. No se cambió la configuración de Vercel.

### DEPLOY-03 — Los headers de seguridad efectivos siguen sin verificarse

La revisión del repositorio no encontró un `vercel.json` en la raíz ni una configuración de cabeceras equivalente en los workflows inspeccionados. La API de lectura de proyecto consultada no expone las cabeceras HTTP efectivas de la respuesta desplegada. Por ello no se puede confirmar presencia o ausencia de CSP, HSTS, `X-Content-Type-Options`, `Referrer-Policy`, `frame-ancestors` ni `Permissions-Policy`. Deben verificarse con una petición HTTP real al dominio de producción y a previews, y luego definirlas en una única capa de configuración evitando duplicados o políticas CSP que rompan Supabase/Auth.

**Severidad: pendiente de verificación.** No se añadieron headers sin conocer antes los orígenes y recursos que necesita la aplicación.

### Estado de deployment y trazabilidad de la rama de auditoría

La consulta de Vercel confirmó un deployment `READY` asociado a `abd1b04c59377cc931eb4942c19de578c9ca9383`, no al commit documental más reciente `2177e7f1aa1e406814df2167965a6dd6022c894b`. Por tanto, ese deployment READY no contiene los hallazgos SUPPLY-01/02 ni DEPLOY-01/02/03. El estado de GitHub para el commit `2177e7f1...` informó `failure` en el check Vercel con destino de build-rate-limit. No se realizó un nuevo despliegue ni se modificó el proyecto. No debe presentarse el deployment READY anterior como validación del commit actual.


### LOCAL-04 — La caché del ERP persiste en el navegador después de cerrar sesión

La revisión de `src/hooks/useErpState.ts` (SHA `e87833ca750cf1f1e2bfa6415560d5f1b77662dd`) muestra que el estado de clientes, productos, ventas, compras, costos, finanzas, movimientos y otros módulos se guarda en claves `farmi:user:<userId>:<clave>` de `localStorage`. El aislamiento por identificador evita que la aplicación cargue normalmente la caché de otra cuenta, pero `AuthGate.signOut()` solo ejecuta `supabase.auth.signOut()`; no elimina ni cifra la caché local de esa cuenta. El navegador mantiene esos datos después del cierre de sesión.

**Severidad: media (confidencialidad en equipos compartidos).** Un siguiente usuario con acceso al mismo perfil del navegador puede inspeccionar el almacenamiento local mediante herramientas del navegador o extensiones, aunque la interfaz no le cargue esos datos. Definir política de equipo compartido: evitar persistir datos sensibles localmente, cifrar con claves no persistentes cuando sea viable, limitar la caché a lo indispensable y limpiar el estado en memoria al salir. Antes de limpiar claves históricas, preservar y validar un procedimiento de respaldo/recuperación; no borrar datos existentes automáticamente.

### Controles positivos observados en sesión y caché

`src/services/supabaseClient.ts` configura persistencia y renovación automática de sesión con el cliente oficial de Supabase y utiliza únicamente la publishable key en el navegador; no se observó una service-role key en el cliente revisado. `useErpState.ts` separa claves de caché por ID de usuario y solo importa claves antiguas si el marcador de propietario coincide exactamente. `remoteErpState.ts` valida la identidad del propietario al leer el snapshot y usa una revisión `updated_at` condicional para evitar sobrescrituras obsoletas entre sesiones/dispositivos. Estos controles reducen riesgos, pero no convierten localStorage en almacenamiento confidencial ni sustituyen la autorización por operación en el backend.

La revisión de autenticación fue estática. No se inspeccionó el perfil real del navegador, no se extrajeron tokens, no se consultaron datos privados de usuarios y no se ejecutaron pruebas con cuentas reales. No se modificaron código, almacenamiento local, sesiones ni datos de Supabase.


### STORE-LIVE-03 — Superficie de Storage sin políticas RLS visibles

La consulta de catálogos de la base activa encontró RLS habilitado en las tablas de `storage`, incluidas `storage.objects` y `storage.buckets`, pero no devolvió políticas en el esquema `storage`. Los grants de `anon` y `authenticated` aparecen en algunas tablas del esquema, pero sin policies RLS aplicables esos roles no obtienen acceso a filas mediante las rutas sujetas a RLS. No se inspeccionaron objetos ni archivos, ni se consultaron nombres de buckets.

**Estado: requiere validar necesidad funcional.** Si FARMI o la tienda necesitan subir, reemplazar o leer imágenes mediante Supabase Storage, el flujo podría estar bloqueado o depender de URLs/servicios distintos. Antes de crear policies, identificar el bucket y el flujo real, definir propiedad y visibilidad pública/privada, y limitar SELECT/INSERT/UPDATE/DELETE por bucket y propietario. No añadir políticas genéricas ni abrir lectura/escritura pública.

### DB-LIVE-04 — No se identificaron vistas en los esquemas consultados

La consulta a `pg_views` no devolvió vistas en `public` ni `storage`. Por tanto, en esos esquemas no se encontró una vista que pueda estar omitiendo RLS por defecto. La consulta no cubre otros esquemas ni funciones Edge/API.

### DB-LIVE-05 — Historial de migraciones no permite acreditar el esquema desplegado

La herramienta de migraciones devolvió cero entradas, mientras que el repositorio contiene migraciones SQL preparadas, incluida `202611020002_supplier_credit_note_atomic.sql`. La inspección de funciones confirma que `public.resolve_supplier_credit_note(bigint)` no existe en la base activa. La migración no está aplicada. No debe inferirse que el estado completo de producción coincide con los archivos SQL del repositorio; hay que reconciliar el esquema real mediante un diff controlado antes de planificar cambios.

**Alcance de esta ronda:** consultas SELECT de catálogos, policies, grants y roles; lectura de archivos de auditoría y migración en la rama de seguridad. No se leyeron filas ERP, objetos de Storage ni datos personales. No se ejecutó DDL/DML ni se cambió configuración.


### API-01 — El endpoint administrativo no limita intentos ni operaciones

La revisión de `api/admin-users.ts` (SHA `6f4a603324c170d2b7b2113b50096b9b732aa870`) confirma validación del access token mediante `auth.getUser`, autorización de administrador en servidor para las acciones de gestión y respuestas que no exponen detalles internos del proveedor. Sin embargo, no se observa limitación persistente por usuario/IP ni cuotas para bootstrap, creación/invitación, restablecimiento de contraseña o cambios de cuenta. El uso de `timingSafeEqual` para el token de bootstrap reduce filtraciones por comparación temporal, pero no detiene intentos repetidos ni abuso de una cuenta administradora comprometida.

**Severidad: alta para bootstrap; media para otras acciones.** Incorporar limitación persistente compartida entre instancias, enfriamiento para acciones sensibles y auditoría de actor/acción/resultado. No usar contadores en memoria serverless. Probar límites y respuestas antes del despliegue. No se modificó el endpoint ni los secretos.

### API-02 — La publicación del catálogo permite productos sin marca explícita de publicación

La revisión de `api/store-catalog.ts` (SHA `b3f776147de3de0dd3a1625fd89bcc0297b9516e`) confirma que el filtro excluye únicamente productos cuyo campo `active` es exactamente `false`. Un producto con `active` ausente o con otro valor puede incluirse si supera las demás validaciones. La ruta proyecta una allowlist de campos de cara al cliente y mantiene las claves privilegiadas en variables de servidor, controles positivos importantes.

**Severidad: media (exposición no intencional de catálogo).** Definir una marca de publicación explícita y publicar solo registros cuyo valor sea exactamente `true`; validar además que el campo exista en los datos actuales antes de implementar el filtro para evitar ocultar todo el catálogo. No se cambió el comportamiento ni se consultaron filas de productos.

### Inventario de rutas API y alcance de esta ronda

El directorio `api/` de la rama contiene dos endpoints desplegables (`admin-users.ts` y `store-catalog.ts`) y una suite de pruebas (`admin-users.test.ts`). Se inspeccionaron los archivos completos y sus SHA actuales. La suite no cubre rate limiting, límites de tamaño de petición ni las carreras administrativas ya descritas en AUTHZ-15/16. No se ejecutaron pruebas dinámicas contra producción ni solicitudes de escritura.

No se modificó código funcional, configuración, secretos, cuentas, sesiones ni datos de Supabase. No se aplicaron migraciones ni se inició un despliegue.



### API-03 — Validación de entrada no está centralizada ni tiene límites de tamaño explícitos

La lectura de `api/admin-users.ts` muestra que `getBody` acepta cualquier objeto y, si recibe una cadena JSON, convierte errores de parseo en un objeto vacío. Los campos se validan por acción, pero no hay un esquema central que rechace propiedades inesperadas ni límites explícitos para el tamaño del cuerpo, longitud máxima de contraseña/correo/identificador o cantidad de campos. El nombre sí se limita a 160 caracteres y los nombres de usuario tienen una expresión regular restrictiva; son controles positivos parciales.

**Severidad: media (robustez y superficie de abuso).** Incorporar validación de esquema por acción, rechazar tipos y campos inesperados, fijar límites de longitud y tamaño de petición, y probar cuerpos malformados y excesivos. No aceptar que la validación del proveedor sustituya la validación del contrato HTTP. No se modificó el endpoint.

### Cobertura de pruebas de la API administrativa

Se leyó completa la suite `api/admin-users.test.ts` (SHA `c76f784ba4bf2c2993dfd217c866724beae24b78`). Los tests verifican el estado propio sin enumerar usuarios, ausencia y rechazo de token, unicidad atómica del nombre de usuario, denegación de listado a no administradores y rechazo cuando falta el claim activo. No cubren límites/rate limiting, bootstrap concurrente, carrera del último administrador, invitación y compensación, reset-password, actualización/desactivación, validación de payload ni tamaños extremos. No se ejecutó la suite en este entorno; esta sección describe únicamente los casos presentes en el archivo.

La búsqueda de `vercel.json` en la rama devolvió NOT_FOUND y `vite.config.ts` solo configura la base de assets para Vercel/Pages. Esto no acredita ausencia de cabeceras HTTP efectivas: DEPLOY-03 sigue pendiente de una petición HTTP real a los dominios desplegados.

No se modificó código, tests, configuración, secretos, usuarios ni datos de producción. No se inició un despliegue.



### SUPPLY-03 — No lockfile is versionado en la raíz del repositorio

Se consultó la rama `security/erp-state-permission-matrix` y se buscaron `package-lock.json`, `npm-shrinkwrap.json`, `pnpm-lock.yaml` y `yarn.lock`; ninguno existe en la raíz. Tampoco se encontró `.npmrc`. El workflow de CI ejecuta `npm install` y el manifiesto `package.json` declara `latest` para Vite, React, TypeScript, plugin React, Lucide y tipos React. El resultado es una instalación no reproducible y una superficie de dependencia que puede cambiar sin un commit del proyecto.

**Severidad: alta (cadena de suministro y reproducibilidad).** Fijar versiones compatibles, generar y versionar un único lockfile npm, revisar el diff de dependencias y migrar ambos workflows a `npm ci`. Hacerlo en un cambio aislado con build y tests; no actualizar masivamente paquetes durante esta auditoría.

### SUPPLY-04 — GitHub Actions se referencia mediante etiquetas mutables

Los workflows `.github/workflows/ci.yml` (SHA `6026e790c0587d17b207aa718a95d84d0bcaf452`) y `.github/workflows/deploy-pages.yml` (SHA `9aad1c6bc7b183f26b7e061b50b54ed1adc7d563`) utilizan `actions/checkout@v4`, `actions/setup-node@v4`, `actions/upload-pages-artifact@v3` y `actions/deploy-pages@v4`, no SHA completos. CI tampoco declara permisos mínimos explícitos a nivel de job/workflow; Pages sí declara `contents: read`, `pages: write` e `id-token: write`. Una etiqueta puede moverse a otra revisión y los permisos predeterminados dependen de la configuración del repositorio.

**Severidad: media.** Fijar cada acción a un SHA completo oficial verificado, conservar comentario de versión legible y declarar permisos mínimos para cada job. No se alteraron los workflows ni se ejecutó ningún despliegue.

### SUPPLY-05 — La auditoría npm no se puede reproducir localmente desde el estado versionado

El workflow CI genera un informe mediante `npm audit --json` y luego ejecuta `npm audit --audit-level=moderate`, lo cual es un control positivo de detección. Sin embargo, al no existir lockfile, el conjunto auditado depende de las versiones resueltas en esa ejecución; además, el informe JSON se genera como archivo de trabajo y no se publica como artefacto en el YAML inspeccionado. No se puede concluir a partir del archivo del workflow que el árbol actual esté libre de vulnerabilidades: hace falta una ejecución CI exitosa con dependencias fijadas y revisar sus resultados.

**Severidad: alta junto con SUPPLY-01/03.** Tras fijar dependencias, conservar el resumen de auditoría como artefacto de CI o salida accesible y establecer un proceso de revisión/remediación. No se ejecutó `npm install`, `npm audit` ni se modificaron dependencias en esta ronda.

### Alcance de la revisión de cadena de suministro

Se leyeron los manifiestos y workflows completos en la rama de auditoría. Se buscaron archivos lockfile npm/yarn/pnpm y configuración `.npmrc`; las rutas consultadas devolvieron NOT_FOUND. La búsqueda de texto del repositorio no devolvió coincidencias para las cadenas consultadas de entorno/secretos, pero esta búsqueda no equivale a un escaneo exhaustivo de secretos ni demuestra que no existan secretos en historial, artefactos o configuración de proveedores. No se inspeccionaron valores de secretos. No se ejecutaron builds, instalación, auditoría de paquetes, ni acciones remotas. No se cambió código funcional ni configuración de producción.



### DEPLOY-03 — Cabeceras HTTP de seguridad ausentes en respuestas públicas observadas

Se consultó mediante el acceso autenticado de Vercel el dominio `https://difarmas-erp.vercel.app/` y los recursos estáticos referenciados por el HTML, todos con respuesta HTTP 200. En las tres respuestas se observó `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`. En las cabeceras devueltas no aparecen `Content-Security-Policy`, `X-Content-Type-Options`, `Referrer-Policy` ni `Permissions-Policy`. Tampoco se observó `X-Frame-Options`; para protección contra framing se recomienda definir `frame-ancestors` dentro de CSP, tras verificar que no haya integración legítima en iframes.

**Severidad: media (defensa en profundidad).** Configurar cabeceras en una sola capa de Vercel, con CSP inicialmente en modo Report-Only y una lista de orígenes compatible con Supabase Auth, APIs y recursos realmente utilizados; luego pasar a enforcement tras pruebas. Añadir `X-Content-Type-Options: nosniff`, una `Referrer-Policy` restrictiva y una `Permissions-Policy` que deshabilite capacidades no utilizadas. No copiar una CSP genérica sin inventariar conexiones y scripts. No se modificó configuración ni se desplegó.

### DEPLOY-04 — La página raíz responde 200 y publica el shell de inicio de FARMI

La respuesta HTML de la raíz contiene el título DIFARMÁS ERP, un mensaje inicial de carga y referencias a los bundles JS/CSS. Los recursos referenciados respondieron 200. Esto confirma que el dominio sirve el shell y assets en la fecha de consulta, pero no acredita que React termine de iniciar, que el login funcione ni que los flujos de negocio sean operativos; esas verificaciones requieren pruebas funcionales con cuentas de prueba en un entorno controlado. No se enviaron credenciales ni se realizaron acciones autenticadas de negocio.

### Alcance de la verificación HTTP

Las observaciones corresponden al dominio `difarmas-erp.vercel.app` y a los tres recursos consultados el 4 de noviembre de 2026. No se comprobó un dominio personalizado ni cada deployment Preview; sus cabeceras pueden diferir. La comprobación de ausencia se limita a las cabeceras devueltas por estas respuestas. No se inspeccionaron valores de secretos, no se ejecutaron mutaciones y no se cambió la configuración de Vercel.



### AUDIT-STATE-01 — La rama de auditoría no corresponde al código desplegado en producción

La comparación GitHub entre `main` y `security/erp-state-permission-matrix` indica que la rama de auditoría está 406 commits por delante y 0 por detrás; contiene modificaciones de aplicación, migraciones, tests y documentos que no forman parte del árbol actual de `main`. La inspección autenticada del alias de producción `difarmas-erp.vercel.app` devuelve un deployment `READY` asociado a `main`, commit `f785087c0cccc8602f0dca537987b7f05086b1bf` (“Fix finance section initialization build error”).

**Severidad: alta para el proceso de liberación.** Los hallazgos y correcciones que solo existen en la rama de auditoría no deben considerarse aplicados en producción. No hacer merge de los 406 commits como una sola unidad: revisar el diff por grupos, separar correcciones de seguridad verificadas de cambios funcionales/documentales y promover únicamente una secuencia pequeña, probada y aprobada. Verificar el SHA exacto y el estado READY de cada despliegue tras la liberación.

No se hizo merge, push, despliegue ni cambio en producción. La comparación identifica una diferencia de historial/árbol; no certifica por sí sola que cada uno de los 406 commits contenga una corrección de seguridad.



### AUTHZ-18 — El rol Solo lectura depende de RLS para bloquear escrituras, no de una interfaz realmente de solo lectura

La revisión de `src/App.tsx` (SHA `1a26c9a65fae23495c84188c6c132923cd68fc98`) y `src/hooks/useErpState.ts` (SHA `e87833ca750cf1f1e2bfa6415560d5f1b77662dd`) confirma que la interfaz calcula acceso por módulo mediante `activeAllowed`, pero no pasa una capacidad de solo lectura a los componentes ni deshabilita de forma general las acciones de edición, cobro, pago, compra, ajuste o eliminación. La migración `202611020001_erp_state_role_write_guard.sql` (SHA `c771a6d7f37577dc7757955a5e108d0b18d2cba1`) excluye el rol Solo lectura de INSERT/UPDATE en RLS, por lo que el bloqueo efectivo depende de que la política esté desplegada y de que todas las escrituras pasen por esa tabla.

**Severidad: alta (integridad y experiencia de usuario).** Mantener el rechazo de escritura en servidor/RLS, pero añadir capacidades de lectura por acción y hacer que la interfaz no ofrezca controles de mutación a Solo lectura. Los servicios deben rechazar la operación antes de cambiar el estado local, no esperar a que falle el autosave. Probar intentos directos contra la API/tabla y flujos UI con una cuenta Solo lectura. La migración no se ha aplicado ni verificado en producción; no se debe asumir que el bloqueo de RLS está activo.

### Revisión de aptitud para liberar cambios de autorización

Se compararon los archivos actuales de la rama de auditoría con `main`. En la rama hay mejoras relevantes (gating de módulos en `App.tsx`, escritura condicional por revisión en `remoteErpState.ts`, y política RLS que falla cerrada para claims/roles ausentes). Sin embargo, la misma rama contiene cambios amplios en el hook de estado, componentes, servicios financieros/comerciales, tests y migraciones. El helper `src/security/erpStateDiff.ts` declara expresamente que solo calcula diferencias JSON y **no** aplica autorización ni protege escrituras. La migración RLS advierte que el snapshot sigue siendo monolítico y que no resuelve autorización por módulo/operación.

**Decisión de esta ronda: no hay un paquete de liberación aislado que pueda aprobarse con la evidencia estática disponible.** Antes de promover cambios se necesitan build/tests reproducibles, pruebas de roles con cuentas de prueba, confirmación de compatibilidad del claim `farmi_active` para todas las cuentas y despliegue controlado de la migración en un entorno no productivo. No se hizo cherry-pick, merge ni despliegue.



### AUTHZ-19 — La RPC de nota de crédito de proveedor no valida el importe contra el detalle original de compra/devolución

**Evidencia:** `supabase/migrations/202611020002_supplier_credit_note_atomic.sql` (SHA `b989dc90c12148abb63b0be707b139bea2ed8adc`). La función bloquea la fila `erp_state`, comprueba estado e idempotencia de la devolución y actualiza en una sola transacción los arrays de devoluciones, cuentas por pagar y créditos. No obstante, toma `totalCost` directamente del registro `supplierReturns` del snapshot y lo usa como importe del crédito. No recalcula el valor a partir de cantidades y costos de los artículos vinculados a la compra, ni valida cantidades devueltas acumuladas contra las cantidades realmente recibidas en la compra.

**Severidad: alta (riesgo de crédito/contabilidad incorrecto).** La atomicidad evita dobles procesamientos, pero no garantiza que el importe sea correcto. Antes de aplicar esta RPC, validar en servidor cada artículo de devolución contra las líneas de compra y su historial de costos, comprobar que no se exceda la cantidad comprada menos devoluciones anteriores y calcular el importe dentro de la transacción. Si el esquema snapshot no conserva evidencia suficiente, registrar el detalle de compra/devolución en tablas normalizadas en una fase de migración. No aplicar esta migración en producción en su estado actual.

### AUTHZ-20 — Las operaciones de venta y recepción de compra siguen siendo escrituras compuestas en cliente

**Evidencia:** `src/hooks/useErpState.ts` (SHA `e87833ca750cf1f1e2bfa6415560d5f1b77662dd`), funciones `recordSale` y `receivePurchase`. `recordSale` acepta `CartItem[]` y `StandardInvoiceDetails` del navegador, construye precio, costo, descuentos, impuestos, utilidad y total en cliente, y luego actualiza por separado productos, movimientos, ventas y cuentas por cobrar. La validación de factura duplicada consulta el snapshot local. La recepción de compra también actualiza varias partes del snapshot por setters y usa una protección local contra doble envío.

**Severidad: crítica para integridad financiera e inventario.** El guardado condicional de `updated_at` evita que una revisión vieja reemplace una nueva, pero no convierte las acciones de negocio en transacciones ni evita que dos dispositivos ejecuten la misma venta/recepción a partir de la misma revisión. No liberar esto como corrección de seguridad completa. El diseño objetivo es RPC por operación con idempotency key, bloqueo transaccional, validación de rol + permiso de módulo + capacidad de acción, y recálculo de precios, impuestos, costos, existencia y saldos usando datos guardados en servidor. Mantener el snapshot actual compatible hasta contar con migración y pruebas de reconciliación.



### INV-10 — El alta/edición/eliminación de productos modifica existencias sin una operación de inventario autorizada

**Evidencia:** `src/hooks/useErpState.ts` (SHA `e87833ca750cf1f1e2bfa6415560d5f1b77662dd`), funciones `saveProduct` y `deleteProduct`. La edición permite cambiar directamente `stock`; si cambia, crea un movimiento de ajuste, pero el movimiento no exige motivo estructurado, actor, aprobación ni evidencia. La eliminación retira físicamente el producto del catálogo y, si tenía existencias, registra una salida generada automáticamente. Ambas operaciones actualizan el snapshot desde el cliente.

**Severidad: alta (trazabilidad e integridad de existencias).** Separar datos maestros de ajustes de inventario: una edición normal no debe cambiar existencias; todo ajuste debe ser una operación explícita con cantidad, motivo obligatorio, usuario/fecha y, según umbral, aprobación. Sustituir eliminación física por archivado/baja lógica que preserve referencias históricas. La validación debe ejecutarse en servidor/transacción, no solo en el formulario. No se modificó código funcional ni datos.

### INV-11 — Despacho de devolución a proveedor no es atómico ni tiene idempotencia compartida

**Evidencia:** `recordSupplierDispatch` en `src/hooks/useErpState.ts` valida el estado pendiente, cantidades enteras y existencia disponible; agrupa cantidades por producto y genera movimientos. Sin embargo, `supplierDispatchInProgress` es un `Set` en memoria del navegador. La reducción de existencias y el registro de movimientos se realizan mediante setters independientes. La comprobación de movimientos existentes en el snapshot no protege dos sesiones/dispositivos que procesen simultáneamente la misma devolución.

**Severidad: crítica (riesgo de doble salida o stock inconsistente).** Implementar una operación transaccional de despacho con bloqueo de la devolución y productos, idempotency key persistente, validación de cantidades contra el detalle original y registro inseparable de movimiento/estado. Rechazar la repetición aun cuando provenga de otra sesión. No desplegar una RPC que solo replique las validaciones del cliente.

### RET-10 — La resolución de devoluciones de venta y los cambios de proveedor tienen rutas de escritura distintas y parcialmente locales

**Evidencia:** `resolveSupplierReturn` registra el rechazo cambiando solo el estado del snapshot; al recibir cambio actualiza productos, movimientos y devolución mediante setters separados. Solo la nota de crédito invoca la RPC atómica existente, que mantiene el riesgo de importe descrito en AUTHZ-19. `recordSaleAdjustment` calcula importes y cantidades en cliente, verifica contra líneas originales usando `canApplySaleAdjustmentItems`, y luego actualiza productos, movimientos, cuentas por cobrar, caja y ajustes mediante setters separados. El bloqueo de repetición está en memoria local.

**Severidad: crítica para devoluciones de venta; alta para rechazo/cambio de proveedor.** Unificar cada resultado de devolución en una transacción de servidor: validar documento original, líneas y cantidades acumuladas; recalcular importe/impuesto/costo; validar saldo y método de reembolso; actualizar inventario/caja/cuenta/estado y registrar actor, fecha y motivo. El rechazo también debe dejar evidencia inmutable y actor. La validación del helper de frontend es útil para UX, pero no constituye autorización ni control de integridad.

### INV-12 — La recepción de compra permite que el total introducido sustituya al total calculado sin conciliación

**Evidencia:** `receivePurchase` calcula `calculatedTotal` como suma de cantidad por costo, pero si `enteredTotal` es un número finito no negativo, lo acepta como `total` sin verificar que coincida con el detalle ni representar explícitamente descuentos, impuestos, flete u otros cargos. Ese total alimenta compra, crédito de proveedor y cuenta por pagar; el inventario y el historial de costos siguen calculándose desde las líneas.

**Severidad: alta (descuadre de inventario y cuentas por pagar).** Definir componentes explícitos de conciliación (descuentos, impuestos, cargos) y validar que el total de documento sea igual al total calculado más/menos esos componentes, con tolerancia monetaria documentada. El servidor debe recalcular y rechazar diferencias no justificadas dentro de la transacción. No basta con aceptar un total alternativo del navegador.

### Evidencia y límites de esta revisión de inventario/devoluciones

Se inspeccionaron el hook de estado, `inventoryService.ts`, `saleAdjustmentService.ts` y los tipos de dominio. El servicio de inventario sí comprueba productos existentes, cantidades positivas, servicios, existencias, costos y vencimiento mínimo para recepciones; el helper de devoluciones de venta controla cantidades acumuladas por línea en la interfaz. Esos controles reducen errores accidentales, pero están en código cliente y no sustituyen validación autoritativa. No se ejecutaron pruebas dinámicas, no se enviaron operaciones de negocio, no se aplicaron migraciones y no se modificaron datos de Supabase ni producción.



### FIN-11 — El cierre diario no tiene unicidad ni bloqueo transaccional compartido

**Evidencia:** `src/components/Finance.tsx` (SHA `556a4e667e1c336f0055a8a7de96a5240ba3d363`). `closeCash` comprueba `alreadyClosedToday` sobre el array local y utiliza `closingRef` para evitar doble clic en esa instancia. Después agrega el cierre mediante `setClosures`. Dos sesiones pueden observar que el día sigue abierto y registrar cierres simultáneos; no hay evidencia de clave única por caja/fecha ni de una operación transaccional en servidor. El cierre tampoco congela el conjunto de operaciones que alimentó el cálculo: pueden registrarse movimientos concurrentes mientras se cierra.

**Severidad: alta (control de caja y auditoría).** Crear una operación de cierre en servidor con identificador de caja/fecha y restricción única, bloqueo transaccional, corte consistente de movimientos y totales recalculados desde registros autoritativos. El cierre debe quedar inmutable; correcciones posteriores deben ser ajustes auditados con actor, motivo y referencia, no edición o sustitución del cierre original. No aplicar cambios ni migraciones en producción durante esta auditoría.

### FIN-12 — Los movimientos manuales de caja no conservan evidencia suficiente para una conciliación auditada

**Evidencia:** En la sección `movimientos` de `Finance.tsx`, el formulario registra tipo, descripción, monto y categoría mediante `addCashMovement`, usando el estado local. El modelo `CashMovement` solo contiene `id`, tipo, descripción, monto, categoría y fecha; no incluye actor, referencia documental, contraparte, aprobador ni evidencia adjunta. La categoría se selecciona desde el navegador y determina si el movimiento participa en el efectivo esperado.

**Severidad: alta (trazabilidad financiera).** Exigir motivo y categoría controlada en servidor, actor autenticado, fecha del servidor y referencia/evidencia según el tipo de movimiento. Separar movimientos de caja de banco/no efectivo con clasificación validada, y establecer aprobación para retiros/aportes que superen umbrales configurables. No se cambió el modelo ni los datos existentes.

### FIN-13 — El método de pago y la imputación de cobros/pagos son datos confiados al navegador

**Evidencia:** `collect` y `paySupplier` en `Finance.tsx` leen el monto y método de pago del estado del componente, validan el saldo local y actualizan por separado la cuenta por cobrar/pagar y `paymentTransactions`. La validación `validPayment` es útil para la interfaz, pero no es autoritativa. Un request manipulado puede intentar alterar método, monto o cuenta, y dos sesiones pueden consumir el mismo saldo pendiente antes de sincronizar.

**Severidad: crítica (integridad de saldos y caja).** La operación de cobro/pago debe recibir un identificador idempotente y una cuenta destino; el servidor debe bloquear la cuenta, recalcular saldo, validar rol/permisos/capacidad, validar método y referencia, registrar la transacción y actualizar el saldo dentro de una sola transacción. No permitir que el navegador envíe un saldo actualizado como fuente de verdad.

### Evidencia y límites de la revisión financiera complementaria

Se inspeccionó `src/components/Finance.tsx` y se contrastó con los hallazgos previos FIN-06 a FIN-10. La interfaz valida montos positivos, saldo disponible, evita doble clic local y calcula el efectivo esperado a partir de ventas, cobros, gastos, compras, pagos y movimientos del día. Esos controles no proporcionan bloqueo multiusuario, unicidad persistente ni autorización de servidor. No se ejecutaron pruebas dinámicas, no se crearon cobros/pagos/cierres, no se aplicaron migraciones y no se modificaron datos de Supabase ni producción.

### AUTH-21 — La comprobación inicial de sesión no gestionaba rechazos inesperados

**Evidencia:** `src/components/AuthGate.tsx`. La inicialización ejecutaba `supabase.auth.getSession().then(...)` sin manejar el rechazo de la promesa. Un fallo inesperado podía dejar el estado `checking` activo indefinidamente. Se corrigió en el commit `5d0a4db9298cb6e1e3fae44995ddad66cfcf8250`: el rechazo ahora mantiene `user` en `null`, muestra un mensaje genérico y finaliza el estado de comprobación. La ruta de error no concede acceso.

**Severidad: media (disponibilidad del acceso). Estado: corrección de código aplicada en la rama de auditoría; pendiente de build y prueba automatizada/dinámica.** No se modificaron sesiones, cuentas ni datos de Supabase y no se desplegó a producción.

### Alcance y límites de la revisión de autenticación

El cliente Supabase configura persistencia, renovación automática y detección de enlaces; `AuthGate` escucha cambios de autenticación y desuscribe el listener al desmontarse. `App.tsx` exige `farmi_active === true` para habilitar módulos. El guard visual de `AuthGate`, en cambio, muestra «Acceso desactivado» cuando el claim es explícitamente `false`; la denegación de un claim ausente depende de las capas posteriores y de RLS. La caché de datos permanece en `localStorage` tras cerrar sesión (LOCAL-04).

La revisión fue estática y la corrección AUTH-21 aún no cuenta con pruebas dinámicas. No se inspeccionaron tokens ni datos personales, no se usaron cuentas reales, no se ejecutaron operaciones de negocio ni se modificaron datos o configuración de producción.