# FARMI / DIFARMAS ERP — plan de pruebas RLS entre roles

**Estado:** plan estático; no ejecutado contra Supabase.  
**Rama:** `security/erp-state-permission-matrix`  
**Objetivo:** validar que las políticas y operaciones del ERP impidan escrituras fuera del alcance del rol, sin tocar datos de producción.

## 1. Condiciones obligatorias

1. Usar un proyecto Supabase de staging separado de producción, con datos ficticios.
2. Crear usuarios de prueba independientes para Administrador, Supervisor, Ventas, Compras, Finanzas, solo lectura y rol desconocido.
3. Asignar los claims `farmi_role`, `farmi_active` y `farmi_permissions` mediante el flujo administrativo previsto; no editar JWT reales ni compartir tokens.
4. Confirmar que el cliente de prueba usa la clave pública y que las operaciones se ejecutan con el contexto `authenticated`, nunca con `service_role` ni `postgres`.
5. Mantener respaldos del staging y usar registros identificados como fixtures.
6. Ejecutar las pruebas destructivas solo en staging. Si se hace una prueba dentro de una transacción, confirmar que todas las operaciones y efectos secundarios son transaccionales antes de depender de `ROLLBACK`.

## 2. Usuarios y permisos de prueba

| Usuario | Rol | Estado | Permisos esperados |
|---|---|---|---|
| T-ADMIN | Administrador | activo | administración completa conforme a política |
| T-SUP | Supervisor | activo | solo permisos asignados explícitamente |
| T-VENTAS | Ventas | activo | ventas/POS; sin edición directa de costos o compras |
| T-COMPRAS | Compras | activo | compras/proveedores/inventario según matriz |
| T-FIN | Finanzas | activo | operaciones financieras autorizadas; sin alterar catálogo |
| T-LECTURA | rol de solo lectura | activo | SELECT permitido; escrituras denegadas |
| T-INACTIVO | Ventas | inactivo | acceso denegado según política acordada |
| T-DESCONOCIDO | rol no reconocido | activo | acceso denegado por defecto |

Los nombres anteriores son identificadores de fixtures, no usuarios reales. Documentar UUID, claims y fecha de creación en el entorno de staging, nunca en este repositorio.

## 3. Pruebas de aislamiento por fila

Para cada usuario, comprobar:

- Puede leer únicamente su fila de `erp_state`.
- No puede leer la fila de otro usuario.
- No puede insertar una fila usando el UUID de otro usuario.
- No puede actualizar la fila de otro usuario.
- No puede borrar filas (no debe existir una política DELETE accidental).
- No puede acceder a datos cuando está inactivo o tiene un rol desconocido, según la política aprobada.

**Criterio de aprobación:** toda operación fuera del ámbito propio debe devolver cero filas o un error de autorización; nunca debe modificar el fixture ajeno.

## 4. Pruebas de escritura cruzada por rol

Probar cada operación desde la interfaz y directamente contra la API con el JWT de ese usuario. No basta con ocultar botones en React.

| Actor | Operación | Resultado esperado |
|---|---|---|
| Ventas | registrar venta por operación autorizada | permitido |
| Ventas | cambiar costo de producto o precio mayorista | denegado |
| Ventas | modificar compra/proveedor | denegado |
| Ventas | registrar cobro mediante operación financiera autorizada | solo si el permiso específico lo permite |
| Compras | recibir compra y actualizar stock/costo mediante operación autorizada | permitido |
| Compras | registrar venta o alterar cobros | denegado |
| Finanzas | registrar cobro/pago mediante operación autorizada | permitido según permiso específico |
| Finanzas | reescribir catálogo, lotes o historial de movimientos | denegado |
| Solo lectura | SELECT autorizado | permitido |
| Solo lectura | INSERT/UPDATE/DELETE | denegado |
| Rol desconocido | cualquier escritura | denegado |
| Usuario inactivo | lectura y escritura protegidas | denegado |

Si las operaciones aún se realizan modificando el snapshot JSONB completo, marcar como **no verificable por suboperación** cualquier caso donde la policy solo distingue la clave superior. No declarar aprobada la separación por módulo si no existe validación del contenido o RPC específica.

## 5. Pruebas de integridad del snapshot

Usar snapshots ficticios y verificar:

- Rechazo de claves JSON desconocidas.
- Rechazo de tipos incorrectos y estructuras malformadas.
- No se permite que una operación autorizada cambie claves no relacionadas.
- No se permite alterar identificadores, titular, importe original, fecha o referencia de documentos históricos mediante una actualización genérica.
- Movimientos de inventario e historial de costos son append-only; correcciones mediante reversos auditables.
- Cobros y pagos no pueden editarse o borrarse como movimientos históricos.
- Un usuario no puede cambiar su propio rol, permisos o estado desde `settings.users` o el snapshot.

## 6. Concurrencia, sesiones y operaciones financieras

- Dos actualizaciones concurrentes del mismo snapshot: verificar conflicto/reintento y que no se pierdan cambios.
- Repetir una misma solicitud de cobro/pago: verificar idempotencia y ausencia de duplicados.
- Intentar cobrar más del saldo pendiente: debe rechazarse en servidor.
- Intentar aplicar un pago a una cuenta distinta: debe rechazarse.
- Desactivar una cuenta y repetir una solicitud con sesión/JWT anterior: confirmar el comportamiento real de claims y revocación; no asumir que cambiar `app_metadata` invalida inmediatamente todos los JWT emitidos.
- Fallo entre invitación y asignación de metadata: verificar que la cuenta quede identificada como pendiente y no reciba permisos por defecto.

## 7. Evidencia que se debe guardar

Por cada caso registrar: ID, fecha/hora, entorno, usuario de prueba, rol/claims, operación, resultado HTTP/SQL, filas afectadas antes/después y evidencia de auditoría. No guardar access tokens, refresh tokens, claves API ni secretos en logs o GitHub.

## 8. Bloqueos conocidos antes de aprobar

- La policy actual de `erp_state` controla rol general, pero no demuestra autorización por cada suboperación o elemento del JSONB.
- Las claves `products`, `receivables`, `payables`, `paymentTransactions` y `settings` agrupan operaciones de distinta sensibilidad.
- La primera carga/importación del snapshot requiere un flujo explícito y validado; no crear filas vacías automáticamente al invitar.
- `farmi_active` ausente se interpreta actualmente como activo en las rutas revisadas; cualquier cambio a fail-closed requiere inventario y migración planificada.
- Claims antiguos pueden permanecer en JWT existentes hasta renovación/expiración.
- No se ha verificado el catálogo real de políticas, grants, triggers, funciones ni vistas de Supabase.

## 9. Criterio de salida

No promover cambios a producción hasta que:

1. El inventario SQL de `supabase/tests/erp_state_security_inventory.sql` se ejecute y revise en staging.
2. Todas las pruebas de aislamiento por fila pasen.
3. Las escrituras cruzadas sean denegadas o estén implementadas como RPC específicas y autorizadas.
4. Las pruebas de concurrencia, idempotencia y sesión antigua pasen.
5. Se documente cualquier excepción aceptada y exista plan de reversión.
6. La batería se repita contra una copia de staging con la misma versión de migraciones que se pretende desplegar.

**Este documento no ejecuta pruebas, no cambia políticas y no autoriza despliegues.**
