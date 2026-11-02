# Plan de pruebas de seguridad para FARMI

Estado: planificación; pendiente de ejecución en Supabase/Postgres. Este documento no autoriza cambios en producción.

## Objetivo

Verificar que los permisos de módulo se apliquen a las operaciones reales y que los guardados del snapshot no permitan modificar información ajena al permiso concedido. Las pruebas deben ejecutarse primero en un proyecto/entorno aislado con datos ficticios.

## Principio de diseño

La autorización por clave JSONB es una barrera inicial, no un control de campos. Si una operación necesita modificar una parte de una clave compartida, no se debe conceder acceso irrestricto a toda esa clave solo para hacer funcionar la pantalla. Las operaciones sensibles deben migrarse a RPCs transaccionales o a tablas normalizadas con RLS.

## Operaciones que requieren separación explícita

| Operación | Permiso que inicia la acción | Cambios derivados que deben quedar dentro de la misma operación | Riesgo que debe probarse |
|---|---|---|---|
| Registrar venta | `ventas` | venta, salida de inventario y cuenta por cobrar si es crédito | No permitir cambiar costos, precios maestros ni cobros históricos por el solo permiso de ventas. |
| Emitir/actualizar factura estándar | `facturacion_estandar` | factura/venta, salida de inventario y saldo por cobrar cuando aplique | No permitir alterar cobros ya registrados ni configuración fiscal/usuarios. |
| Recibir compra | `compras` | compra, existencia, movimientos, histórico de costo y cuenta por pagar si es crédito | No permitir modificar pagos a proveedores ni gastos/caja. |
| Ajustar inventario | `inventario` | producto/cantidad y movimiento correspondiente | No permitir editar ventas, compras, costos financieros ni saldos. |
| Cobrar cuenta | `cuentas_cobrar` | saldo de la cuenta y transacción de cobro asociada | No permitir insertar pagos a proveedores ni editar ventas originales. |
| Pagar proveedor | `cuentas_pagar` | saldo por pagar y transacción de pago asociada | No permitir registrar cobros de clientes ni alterar compras originales. |
| Registrar gasto/cierre/movimiento de caja | `finanzas` | registro financiero correspondiente | No permitir cambiar productos, inventario o documentos comerciales. |
| Devolución/anulación de venta | Permiso específico por definir | ajuste, inventario y saldo/reembolso aplicable | No permitir alterar cuentas o movimientos que no correspondan al documento original. |
| Devolución a proveedor | Permiso específico por definir entre compras/proveedores | devolución, inventario y nota de crédito/cuenta por pagar aplicable | No permitir modificar pagos ya realizados fuera del ajuste autorizado. |
| Solicitud de producto faltante | Crear desde ventas; resolver desde módulo autorizado por definir | solicitud y cambio de estado | No conceder escritura general de reportes para resolver solicitudes. |

## Pruebas de autorización del snapshot

1. Una actualización que no cambia `state` pero sí `updated_at` no debe requerir permisos de módulo; sí debe validar cuenta activa y rol.
2. Un snapshot completo idéntico no debe interpretarse como modificación de todas las claves.
3. Una clave desconocida o agregada en el futuro debe bloquearse hasta documentar y autorizar su uso.
4. Una cuenta inactiva debe tener SELECT/INSERT/UPDATE denegados según la política definida; nunca debe considerarse activa por ausencia del metadato.
5. Un rol ausente, desconocido o `Solo lectura` no debe poder escribir.
6. Permisos ausentes, malformados o no confiables deben fallar de forma cerrada.
7. No debe ser posible cambiar `user_id`, borrar la fila ni escribir la fila de otra cuenta.
8. Una escritura con revisión `updated_at` obsoleta debe fallar sin sobrescribir cambios recientes.
9. Una operación compuesta válida debe confirmar todos sus cambios o ninguno.
10. Un usuario con `cuentas_cobrar` no debe poder modificar pagos a proveedores mediante `paymentTransactions`, y viceversa.
11. Un usuario con `ventas` no debe poder editar campos maestros sensibles de productos al registrar una salida.
12. `settings.users` no debe conceder permisos ni reemplazar la autoridad de `app_metadata`.

## Pruebas de inicialización (INSERT)

Se deben cubrir dos caminos distintos:

- Cuenta nueva sin datos previos: solo puede recibir una plantilla canónica mínima creada/validada por un proceso confiable. No aceptar JSON arbitrario del navegador.
- Cuenta con datos locales que deben conservarse: importación autenticada de una sola vez, con validación completa de estructura, claves y permisos. Si contiene información no autorizada o ambigua, detener la importación y solicitar intervención administrativa; no descartar datos silenciosamente.

Casos negativos:
- Segundo intento de inicialización.
- Snapshot con claves desconocidas.
- Snapshot que contiene datos de módulos no autorizados.
- Cuenta que ya tiene fila remota.
- Dos sesiones que intentan inicializar simultáneamente.

No se debe crear una fila vacía automáticamente al invitar al usuario hasta resolver el flujo de importación local.

## Pruebas de regresión funcional

- Guardado automático del snapshot completo sin cambios ajenos a la operación.
- Guardado parcial de cotizaciones sin perder cambios recientes de otras claves.
- Cola de guardado por usuario y conflicto de revisión entre pestañas/dispositivos.
- Registro de venta contado y crédito.
- Factura con saldo y sin saldo.
- Compra contado y crédito.
- Cobro parcial/total y pago parcial/total.
- Devolución con reposición, sin reposición, nota de crédito y reembolso, según los flujos soportados.
- Carga remota de snapshot existente y primer guardado cuando no existe fila.
- Conservación de datos locales previos a la primera sincronización.

## Criterios de aceptación

- Todas las pruebas negativas son rechazadas por la base de datos, no solo ocultadas/deshabilitadas en la interfaz.
- Las operaciones compuestas son atómicas.
- Ninguna clave sensible queda autorizada de forma amplia solo para satisfacer una dependencia indirecta.
- La inicialización no acepta datos arbitrarios ni destruye datos locales legítimos.
- No hay cambios de producción ni migración aplicada hasta completar pruebas en un entorno aislado y revisar el plan de reversión.

## Estado de ejecución

- Revisión estática del código y trazado de dependencias: realizada parcialmente y documentada en `ERP_STATE_PERMISSION_MATRIX.md`.
- Pruebas unitarias de autorización: pendientes.
- Pruebas de RLS/RPC en Supabase/Postgres aislado: pendientes.
- Pruebas de regresión de interfaz y sincronización: pendientes.
- Aplicación en producción: no autorizada ni realizada.
