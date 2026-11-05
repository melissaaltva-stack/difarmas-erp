# Plan de remediación de seguridad y consistencia transaccional

Estado: propuesta técnica para la rama `security/approval-remediation`.
Fecha de revisión: 2026-11-05.
Alcance: documentación; no modifica código de ejecución ni datos de Supabase.

## Estado y límites

- Este documento registra hallazgos observados en el código de la rama auditada.
- No declara corregidos los riesgos de integridad de negocio descritos abajo.
- No se ejecutaron migraciones ni escrituras en Supabase.
- No se fusionó el PR ni se modificó producción.
- El modelo actual persiste un snapshot JSONB por usuario en `erp_state`; las políticas RLS revisadas restringen el usuario/rol general, pero no autorizan cada operación o campo de negocio.

## Hallazgos confirmados

| ID | Área | Hallazgo | Impacto |
|---|---|---|---|
| TX-01 | Ventas | El navegador calcula y envía precios, descuentos, impuestos, costos y totales; el estado se actualiza en varias escrituras. | Manipulación de importes, ventas parciales y duplicados entre sesiones. |
| TX-02 | Inventario | Las validaciones locales comprueban existencia y stock, pero los datos del carrito no se contrastan con un catálogo autoritativo del servidor. | Precios/costos manipulados y carreras de stock. |
| TX-03 | Compras | La recepción actualiza por separado existencias, movimientos, historial de costos, compra y posible CxP. El total digitado requiere conciliación con las líneas. | Recepciones parciales y saldos no conciliados. |
| TX-04 | Devoluciones a proveedor | Cantidades acumuladas y bloqueos dependen del snapshot/cliente; despacho y resolución afectan varios registros. | Devoluciones duplicadas o superiores a lo recibido. |
| TX-05 | Cuentas por cobrar | Cobrar modifica el saldo y crea la transacción en dos actualizaciones locales separadas. | Saldo y libro de cobros divergentes; doble cobro concurrente. |
| TX-06 | Cuentas por pagar | Pagar modifica saldo y transacción por separado desde el navegador. | Pago duplicado o historial incompleto. |
| TX-07 | Finanzas/caja | Gastos, movimientos y cierres se registran en cliente; locks locales no coordinan dispositivos. | Duplicados, cierres concurrentes y auditoría insuficiente. |
| AUTH-01 | Autorización | La visibilidad de módulos/acciones en UI no constituye autorización de servidor por operación/campo. | Un usuario con capacidad de escritura del snapshot puede intentar cambiar datos fuera de su función. |
| DATA-01 | Maestros | Clientes/proveedores se crean, editan y desactivan mediante mutaciones del snapshot; existe eliminación física de proveedor. | Falta de trazabilidad y riesgo de romper referencias históricas. |
| DATA-02 | Productos | Ajustes de existencia y baja de productos requieren controles auditables del lado servidor. | Cambios de inventario sin evidencia suficiente. |
| STATE-01 | Sincronización | `useErpState` bloquea algunas operaciones con `remoteReady`, pero expone setters directos (`setExpenses`, `setReceivables`, `setPayables`, `setCashClosures`, `setCashMovements`, `setPaymentTransactions`, `setSuppliers`, entre otros) sin una barrera común. El autosave sí se detiene mientras `remoteReady` es falso. | La UI puede cambiar el estado local durante carga/error aunque no se sincronice; los cambios pueden perderse al terminar la carga o quedar solo en el navegador. La protección es desigual según la operación. |

## Arquitectura objetivo

1. Mantener el snapshot como mecanismo de lectura/compatibilidad durante la transición, no como autoridad para operaciones críticas.
2. Crear un backend de comandos autenticados para operaciones críticas. El servidor obtiene el usuario desde el token validado; nunca acepta `user_id`, rol, precio, costo o permiso como autoridad enviada por el navegador.
3. Cada comando ejecuta autorización, validación de esquema, reglas de negocio y persistencia dentro de una única transacción PostgreSQL.
4. Usar claves de idempotencia persistentes con restricción única, vinculadas a usuario, tipo de operación y clave; devolver el resultado original al repetir la misma solicitud.
5. Bloquear filas relevantes y comprobar existencias/saldos acumulados dentro de la transacción.
6. Calcular importes desde catálogo, factura/compra original y reglas fiscales vigentes en servidor. Rechazar diferencias; no aceptar un total digitado como sustituto silencioso del detalle.
7. Registrar auditoría inmutable: actor, fecha del servidor, acción, entidad, referencia, motivo, importes anteriores/nuevos y clave de idempotencia.
8. Usar bajas lógicas para productos, clientes y proveedores con referencias históricas; impedir borrado físico de entidades con movimientos asociados.
9. Aplicar autorización denegada por defecto y validar rol, estado de cuenta y permiso específico en cada comando.
10. Mantener lecturas y escrituras separadas: el cliente no debe poder sobrescribir arbitrariamente el JSON completo para modificar áreas protegidas.

## Orden de implementación

### Etapa 0 — Descubrimiento y contrato
- Inspeccionar esquema real de staging y producción en modo solo lectura, incluyendo columnas, índices, RLS, funciones, triggers y datos de compatibilidad.
- No inferir el esquema a partir de migraciones del repositorio.
- Definir contratos y matriz de permisos por comando.
- Definir estrategia de transición, respaldo, reconciliación y reversión.

### Etapa 1 — Infraestructura de transacciones
- Preparar tablas/funciones en un entorno no productivo.
- Implementar tabla de idempotencia y auditoría.
- Implementar validadores de entrada y respuestas de error sanitizadas.
- Probar autorización negativa y concurrencia.

### Etapa 2 — Operaciones de mayor riesgo
Orden: venta/consumo de stock; recepción de compra; devolución de cliente/proveedor; cobro y pago; cierre de caja.
Cada operación debe ser atómica y tener pruebas de concurrencia e idempotencia antes de migrar su UI.

### Etapa 3 — Maestros y ajustes
- Migrar ajustes de inventario, gastos y movimientos de caja.
- Añadir archivo lógico y auditoría para productos, clientes y proveedores.
- Impedir escrituras de snapshot que eludan los comandos autorizados.

### Etapa 4 — Corte controlado
- Ejecutar pruebas de reconciliación entre snapshot y registros transaccionales.
- Migrar por etapas con feature flags y monitoreo.
- Solo después de aprobación explícita, plan de respaldo y verificación de staging, solicitar autorización para producción.

## Pruebas obligatorias de aceptación

- Dos solicitudes simultáneas con la misma clave de idempotencia generan una sola operación.
- Dos dispositivos intentando vender la última unidad: solo una operación se confirma.
- Dos cobros/pagos concurrentes no superan el saldo pendiente.
- Devoluciones acumuladas nunca exceden cantidades recibidas/vendidas ni el importe acreditable.
- Alterar precio, costo, descuento, impuesto, rol o `user_id` en el cliente no altera el cálculo/identidad del servidor.
- Un usuario sin permiso recibe denegación incluso si invoca directamente el endpoint.
- Fallo en cualquier paso revierte todos los cambios de la operación.
- Cada operación confirmada tiene auditoría consistente y referenciable.
- Las pruebas de migración demuestran que el histórico existente sigue consultable.

## No hacer

- No aplicar migraciones existentes sin contrastarlas con el esquema real.
- No crear nuevas tablas o funciones sobre supuestos no verificados.
- No llamar “seguridad resuelta” a una validación en React o a un lock en memoria.
- No fusionar ni desplegar a producción antes de pasar pruebas y obtener aprobación.


## Bloqueo de entorno para implementar transacciones (2026-11-05)

Verificación de proyectos accesibles:
- El proyecto `difarmas-erp` (`nreumomoqiwgqbtnhbdy`) está activo y corresponde al ERP productivo.
- No hay ramas de desarrollo Supabase disponibles en ese proyecto.
- No se encontró un segundo proyecto Supabase dedicado a pruebas de FARMI.
- `ComparaFarma Honduras` es un proyecto distinto y no se utilizará como entorno de pruebas del ERP.

Decisión de seguridad:
- No ejecutar DDL, DML, migraciones ni pruebas de escritura contra el proyecto productivo.
- No reutilizar la base de ComparaFarma.
- Antes de implementar y probar `sales.create`, se necesita un entorno aislado de FARMI con esquema reproducible y datos sintéticos.
- Hasta disponer de ese entorno, limitar los cambios a código sin efectos en datos, pruebas unitarias y documentación; cualquier integración de base de datos queda bloqueada.
