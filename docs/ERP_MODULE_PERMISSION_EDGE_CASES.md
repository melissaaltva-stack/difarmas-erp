# Hallazgos adicionales de permisos por módulo en FARMI

Estado: revisión estática de la rama `security/erp-state-permission-matrix`. No conectado a persistencia ni producción. No se ejecutaron migraciones.

## 1. Matriz de roles predeterminados en la interfaz

La configuración de `src/components/Settings.tsx` define permisos iniciales por rol:

- Administrador: todos los módulos.
- Supervisor: casi todos los módulos salvo Configuración y Proveedores (según la lista actual).
- Ventas: dashboard, facturación estándar, ventas, redes sociales, clientes y cotizaciones.
- Compras: dashboard, inventario, compras y proveedores.
- Finanzas: dashboard, facturación estándar, finanzas, CxC, CxP, reportes, asistente IA y compras.
- Solo lectura: acceso de consulta a múltiples módulos.

Esta matriz sirve para la interfaz y asignación inicial, pero no es por sí misma una barrera de seguridad. El backend debe validar permisos desde claims confiables o datos de autorización servidoras en cada operación. No confiar en `settings.users` del snapshot ni en un array `permissions` enviado por el navegador.

## 2. Solicitudes de productos faltantes

En `src/components/FinancialModules.tsx` se observa que el estado de solicitudes puede cambiarse desde una tabla mediante `setMissingProductRequests`. La creación se realiza desde el flujo de Ventas/POS según el análisis anterior, mientras la resolución de estado se realiza en el módulo financiero.

Riesgo: si la clave completa `missingProductRequests` se autoriza a Ventas o Compras, cualquiera de esos módulos podría alterar campos ajenos a su función o reescribir solicitudes completas.

Diseño recomendado:
- Ventas/POS: crear solicitud con datos mínimos (producto solicitado, presentación/cantidad, nota y referencia).
- Compras: cambiar estado de la solicitud mediante comando específico, registrando quién y cuándo la resolvió.
- No permitir borrar solicitudes ni reescribir su autor, fecha de creación o contenido original.
- Si se necesita corregir datos, guardar evento de corrección con autor, fecha y motivo.
- Reportes: lectura solamente; no debe obtener escritura general por mostrar el listado.

Una futura operación de servidor debe validar el estado anterior y la transición permitida (por ejemplo Pendiente → Comprado/Descartado), evitando transiciones arbitrarias y reintentos duplicados.

## 3. Duplicación de operaciones de cobro y pago

La revisión de `src/components/Finance.tsx` y `src/components/FinancialModules.tsx` confirma rutas de escritura similares y separadas:
- Ambas actualizan `receivables` y agregan transacciones de tipo `Cobro`.
- Ambas actualizan `payables` y agregan transacciones de tipo `Pago proveedor`.
- Una ruta usa setters de `paymentTransactions`; otra administra un estado local de transacciones (`setTransactions`).

Riesgos:
- reglas de validación divergentes;
- identificadores e idempotencia diferentes;
- una pantalla puede mostrar movimientos que otra no ve si no comparten el mismo origen;
- se duplica lógica crítica de saldo.

Recomendación: centralizar ambos flujos en una única capa de comandos de dominio y, para seguridad real, RPC transaccionales de servidor. No mantener dos implementaciones paralelas que escriban saldos. El historial debe tener una única fuente persistente.

## 4. Settings y configuración

`Settings.tsx` recibe `setSettings` y actualiza el objeto de configuración desde la interfaz. La clave `settings` agrupa datos de empresa, formatos de documentos, usuarios y configuración fiscal/operativa.

No se debe dar autorización de escritura general a `settings` a usuarios que solo necesitan una preferencia específica. Separar en operaciones acotadas:
- datos de empresa y marca;
- plantillas y formatos de impresión;
- configuración fiscal;
- métodos de pago y monedas;
- gestión de usuarios y permisos.

La gestión de usuarios debe permanecer en el endpoint administrativo servidor; nunca aceptar cambios de rol/permisos desde el snapshot ordinario. Validar que el administrador no pueda quitarse accidentalmente el último acceso administrativo activo, y registrar auditoría de altas, bajas, cambios de rol y desactivaciones.

## 5. Decisiones de autorización

1. La visibilidad de un módulo no equivale a autorización de escritura.
2. Un permiso de módulo habilita comandos concretos, no escritura de toda la clave JSONB.
3. Los estados históricos y movimientos financieros deben ser inmutables; corregir mediante reversos o eventos auditables.
4. Las transiciones de estado deben validar estado anterior y siguiente en servidor.
5. Las rutas duplicadas de cobros/pagos deben converger antes de activar controles de producción.
6. La configuración de usuarios debe quedar fuera del snapshot ordinario como fuente de autoridad.

## 6. Pruebas pendientes

- Ventas puede crear solicitud, pero no marcarla como comprada o descartada.
- Compras puede resolver solicitud válida, pero no cambiar su contenido original ni autor.
- Reportes puede consultar solicitudes sin modificarlas.
- Dos pantallas registran cobros/pagos a través del mismo comando y la misma fuente de datos.
- Repetir una solicitud de cobro/pago no duplica el movimiento.
- Un usuario no puede modificar settings fiscales o permisos si carece de capacidad administrativa.
- Un usuario con permiso de módulo de lectura no puede ejecutar comandos de escritura.
- Cambios de rol/permisos se aplican desde backend y no desde valores locales del snapshot.

## 7. Alcance

- Revisión estática de `Settings.tsx`, `Finance.tsx` y `FinancialModules.tsx`.
- No se modificó código funcional.
- No se modificó `main` ni producción.
- No se ejecutaron tests ni migraciones.
- Los controles descritos son recomendaciones de diseño, no protecciones ya activas.
