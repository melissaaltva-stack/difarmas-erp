# Contrato de la primera operación transaccional: registrar venta

Estado: especificación de diseño; todavía no es una implementación ni una migración.
Fecha: 2026-11-05.
Rama de trabajo: `security/approval-remediation`.

## Motivo

La factura estándar calcula subtotal, descuento, ISV y total en el navegador. El cliente también envía objetos de carrito con precio y costo. La función local `buildSaleRecord` deriva total/costo/utilidad de esos objetos. `applySaleToInventory` valida cantidades y stock, pero no compara el precio/costo del carrito con el catálogo autoritativo. La pantalla también calcula correlativo y comprueba duplicados leyendo el snapshot local. Por tanto, las validaciones actuales son útiles para UX, pero no son controles de integridad de servidor.

## Endpoint/comando propuesto

Nombre lógico: `sales.create`.
Método HTTP sugerido: `POST`.
Ruta sugerida: `/api/sales`.
Autenticación: sesión Supabase validada en servidor. El actor se deriva exclusivamente del JWT verificado.

### Entrada permitida del cliente

- `idempotencyKey`: UUID generado por el cliente para un intento lógico y reutilizado en reintentos.
- `invoiceType`: tipo de documento permitido por el servidor.
- `invoiceDate`: fecha comercial solicitada, sujeta a política de fecha.
- `customerId`: ID del cliente o null para consumidor final.
- `paymentMethodId`: identificador de método habilitado.
- `dueDate`: requerido solo cuando el método/condición de crédito lo exige.
- `priceListId`: lista solicitada, solo si el actor tiene autorización para usarla.
- `items`: pares `productId` + `quantity`; unidad/presentación solo si la regla de conversión está registrada y validada en servidor.
- `discounts`: identificadores de descuento/campaña autorizados; no importes libres salvo permiso explícito y validación adicional.
- `notes`: texto acotado y saneado.

### Campos que nunca se aceptan como autoridad del cliente

No confiar en `userId`, rol, permisos, precio unitario, costo, margen, subtotal, importe de descuento, porcentaje ISV, impuesto, total, utilidad, stock disponible, número de factura, saldo de CxC, ni timestamps de auditoría. Si se reciben por compatibilidad, rechazarlos o ignorarlos explícitamente.

## Algoritmo transaccional requerido

1. Validar JWT y derivar `actor_id`; comprobar usuario activo y permiso específico `sales.create`.
2. Validar estructura, límites, cantidades positivas, máximo de líneas y tamaño total del cuerpo.
3. Abrir transacción y reclamar `idempotencyKey` bajo restricción única. Si ya existe una operación completada con la misma huella de solicitud, devolver el resultado original. Si la misma clave se reutiliza con otra huella, responder conflicto.
4. Cargar y bloquear los registros de productos requeridos en orden determinista para evitar deadlocks.
5. Verificar que cada producto está activo/vendible y que existe inventario suficiente. Rechazar IDs repetidos o cantidades inválidas.
6. Resolver precio desde la lista vigente y permisos del actor; resolver costo desde inventario/valoración confiable. Aplicar reglas de descuento, ISV y redondeo en servidor.
7. Validar cliente, RTN y condiciones de crédito. Verificar límite/saldo si el negocio aplica esa política.
8. Asignar correlativo de factura mediante mecanismo transaccional único; nunca calcularlo con `Date.now()` ni con un snapshot local.
9. Insertar cabecera y detalle de venta, reservar/decrementar stock, insertar movimientos de inventario y, si corresponde, CxC. Todo dentro de la misma transacción.
10. Escribir auditoría con actor, operación, referencias, valores calculados y clave de idempotencia.
11. Marcar idempotencia como completada y confirmar transacción. Cualquier fallo revierte todos los cambios.

## Respuesta

Devolver identificador de venta, número de factura asignado por servidor, líneas y totales calculados por servidor, estado de sincronización y fecha del servidor. No devolver secretos ni mensajes internos de Postgres.

## Invariantes y pruebas obligatorias

- Manipular en el navegador precio, costo, margen, ISV, descuento o total no altera el cálculo persistido.
- Cambiar `userId` o rol en el body no cambia al actor autenticado ni sus permisos.
- Repetir una petición con la misma clave no crea una segunda factura ni descuenta stock dos veces.
- Reutilizar la clave con contenido distinto produce conflicto.
- Dos ventas concurrentes por la última unidad no pueden ambas confirmarse.
- Si falla el insert de detalle, movimiento, CxC o auditoría, no queda ninguna parte de la venta persistida.
- El correlativo no se duplica bajo concurrencia.
- No se puede vender producto inactivo/no vendible ni conceder una lista de precios no autorizada.
- Redondeo e ISV coinciden con reglas SAR configuradas y tests de casos límite.
- La auditoría identifica usuario/actor, no un nombre enviado por UI.

## Dependencias previas al desarrollo

El repositorio actual documenta una fila JSONB `erp_state` por usuario; no se debe asumir que existen tablas relacionales de ventas, detalles, existencias, secuencias, cuentas por cobrar o auditoría en el proyecto Supabase conectado. Antes de escribir SQL se requiere inventario de esquema real en un proyecto de pruebas: tablas/columnas, PK/FK, índices, constraints, triggers, RLS, grants, funciones y volumen/forma del histórico.

Si no existe staging aislado, detener la implementación de persistencia. No improvisar tablas ni probar escrituras contra producción.

## Criterio de salida

Esta fase solo se considera terminada cuando el comando está implementado en backend, las escrituras de venta/stock/CxC pasan por la transacción, se han añadido pruebas automatizadas unitarias e integración/concurrencia, y la UI consume la respuesta del servidor sin poder sobrescribir importes autoritativos.
