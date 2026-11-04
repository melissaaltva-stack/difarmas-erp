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
