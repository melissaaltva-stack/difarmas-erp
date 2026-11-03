# Seguridad de productos e inventario en FARMI

Estado: diseño basado en revisión estática. No conectado a persistencia; no se ejecutaron migraciones ni se modificó producción.

## Hallazgo

El tipo `Product` mezcla en una sola entidad:
- Identidad y ficha: código, nombre, categoría, laboratorio, presentación, ingredientes, imagen y proveedor.
- Datos comerciales: costo, precio minorista, mayorista, precios adicionales, impuestos y promociones.
- Operación: stock, stock mínimo, lote y vencimiento.

La clave JSONB `products` guarda todo junto. Autorizar escritura de esa clave permite que Ventas, por ejemplo, cambie costos o precios aunque solo necesite descontar existencias. La comparación de claves top-level no separa propiedades internas.

Además, `useErpState` expone `setProducts`; la seguridad no puede depender de que la interfaz o los componentes oculten campos.

## Operaciones revisadas

| Operación | Efectos actuales | Control requerido |
|---|---|---|
| `recordSale` | Descuenta stock; agrega venta y movimiento; puede crear CxC | Descuento solo por venta validada; no modificar ficha ni precios maestros |
| `updateStandardInvoice` | Recalcula stock y líneas de factura; puede actualizar CxC | Validar factura original, cantidades y efectos financieros en servidor |
| `receivePurchase` | Incrementa stock/costo; agrega compra, historial, movimiento y posible CxP | Recepción validada, costo calculado en servidor y lote/vencimiento asociados |
| `recordSaleAdjustment` | Puede reponer stock y ajustar CxC | Referencia a venta original y límite de cantidades devueltas |
| `recordSupplierDispatch` | Descuenta stock y registra movimiento | Devolución autorizada, existencia y cantidades verificadas |
| `resolveSupplierReturn` | Repone stock/costo o ajusta CxP | Resolución ligada al expediente y transacción atómica |
| `saveProduct` | Crea/reemplaza producto; puede generar ajuste de stock | Separar edición maestra de ajuste de existencias |
| `deleteProduct` | Elimina producto del arreglo | Archivar; conservar referencias históricas |

## Separación recomendada

### Catálogo
Código, nombre, categoría, laboratorio, presentación, ingredientes, imagen y proveedor predeterminado. Ventas solo consulta. Las modificaciones deben pasar por una operación específica de catálogo y permiso de inventario/administración.

### Precios y costos
Costo, precio minorista, mayorista, listas adicionales, margen, impuestos y promociones requieren capacidad separada y auditoría. Ventas consulta precios permitidos pero no modifica el maestro. Compras registra costos de adquisición mediante recepción; no reemplaza arbitrariamente el producto completo. Cambios manuales deben guardar autor, fecha, valor anterior/nuevo y motivo.

### Existencias, lotes y vencimientos
El stock debe derivarse de movimientos, no ser un número libre enviado por el cliente:
- Venta confirmada: descuenta.
- Recepción confirmada: incrementa por lote.
- Devolución validada: ajusta según destino de la mercancía.
- Ajuste manual: permiso específico, motivo y auditoría.
- Lotes y vencimientos: registrados por recepción y consumidos según reglas aprobadas.

## Arquitectura objetivo

No recomiendo triggers que comparen solo JSONB ni permisos sobre la clave completa. La granularidad actual es insuficiente.

Separar progresivamente:
1. `products`: identidad y ficha maestra.
2. `product_prices` e historial de precios/costos.
3. `inventory_lots`: producto, lote, vencimiento y cantidades.
4. `inventory_movements`: libro de movimientos append-only; correcciones mediante reversos/ajustes auditados.
5. Operaciones transaccionales de servidor para venta, recepción, devoluciones, despacho y ajuste.

Cada operación debe validar sesión y permiso en servidor, bloquear filas necesarias, comprobar cantidades/referencias, aplicar idempotencia y escribir todos los efectos relacionados en una transacción. El cliente no debe decidir el stock final ni el costo promedio final.

## Contratos mínimos

### Registrar venta
Aceptar líneas y cantidades, cliente y datos de pago. Validar producto vendible, disponibilidad por lote, precio autorizado, permiso de ventas e idempotencia. Crear venta, movimientos y CxC aplicable en una transacción. No aceptar objetos Product completos para actualizarlos.

### Recibir compra
Aceptar proveedor, documento, líneas, cantidades, costos, lotes y vencimientos. Validar proveedor/documento, importes, duplicados y permiso; calcular existencias y costo conforme a política aprobada. Crear compra, movimientos, historial y CxP en una transacción.

### Ajustar inventario
Exigir permiso específico, producto/lote válido, cantidad, motivo y referencia. Registrar saldo anterior, variación, saldo resultante, autor y fecha. No permitir saldos negativos salvo regla explícita.

### Devoluciones
Vincular a venta/compra original, validar unidades previamente devueltas y registrar destino de mercancía. Los efectos de inventario y cuentas deben ser atómicos o coordinados mediante identificadores idempotentes.

## Riesgos adicionales

- `inventoryMovements` está en otra clave JSONB y podría falsificarse o borrarse si se autoriza escritura completa.
- `purchaseCostHistory` debe ser append-only.
- Las líneas históricas de venta/compra contienen copias de nombre, costo y precio; no deben reescribirse al editar el catálogo.
- Borrar productos puede romper referencias; preferir archivar.
- Los setters expuestos por el hook son una vía para saltarse reglas de interfaz.
- La RLS actual de `erp_state` no inspecciona propiedades internas ni garantiza atomicidad entre colecciones.

## Pruebas de aceptación pendientes

1. Ventas registra una venta válida: stock y movimiento cambian; costo, precio y ficha permanecen intactos.
2. Ventas intenta enviar cambios simultáneos de stock y costo: rechazo.
3. Compras recibe mercancía: stock, lote, vencimiento, costo e historial se actualizan según reglas.
4. Compras intenta cambiar precio minorista/mayorista sin permiso: rechazo.
5. Ajuste autorizado registra motivo, autor, fecha y movimiento.
6. Reintentos no duplican ventas, recepciones ni movimientos.
7. No se vende más de lo disponible en el lote aplicable.
8. Devoluciones no superan unidades vendidas/compradas disponibles.
9. El cliente no puede borrar ni editar movimientos históricos.
10. Fallos intermedios no dejan documentos, stock y cuentas desincronizados.
11. Lecturas de catálogo/precios respetan permisos.
12. Productos archivados conservan referencias históricas.

## Estado y cautelas

- Revisión estática de `src/hooks/useErpState.ts` y `src/domain/types.ts` realizada.
- No implementado el modelo normalizado ni RPC.
- No se ejecutaron migraciones ni se conectó al autosave.
- No se modificó `main` ni producción.
- Tests automatizados y validación Supabase/PostgreSQL pendientes.
- Antes de migrar, inventariar snapshots existentes y diseñar migración reversible que preserve IDs y referencias. No crear filas vacías ni alterar la inicialización/importación local sin plan de preservación de datos.


## Hallazgo adicional: total de recepción aceptado desde el cliente

Se confirmó en la revisión de `src/hooks/useErpState.ts` que `receivePurchase` recibe `enteredTotal` desde la interfaz y lo acepta si es un número finito mayor o igual a cero. No compara ese importe con el total de las líneas recibidas ni deriva el total definitivo en el servidor. Después utiliza ese valor para el registro de compra, la aplicación de crédito del proveedor y el total de la cuenta por pagar. En paralelo, existencias, movimientos e historial de costos se calculan a partir de las cantidades y costos de las líneas.

La interfaz calcula el total de factura incluyendo impuestos y presenta validaciones, pero estas comprobaciones son del lado cliente. Una llamada manipulada puede guardar una obligación financiera que no concuerde con el valor de mercancía/costos recibido; por ejemplo, total cero con líneas de compra de valor positivo, o un total inflado. El efecto exacto depende también de los valores de impuestos/descuentos permitidos por la política comercial.

**Severidad: media (integridad financiera).** Requiere una sesión con capacidad de escritura y manipulación de la solicitud; no demuestra por sí sola acceso anónimo ni exposición de datos. La autorización general de escritura sobre el snapshot agrava el impacto porque no hay validación transaccional por operación.

**Corrección recomendada:** calcular y validar el total final en una operación de servidor usando líneas, descuentos e impuestos autorizados; validar tolerancias y reglas de factura; usar el mismo total validado para compra, aplicación de crédito y CxP; registrar auditoría e idempotencia. No basta con repetir la validación en React.

**Estado:** hallazgo documentado; no se modificó código funcional, no se ejecutó SQL y no se alteraron datos.


## Hallazgo adicional: recepción de cambio de proveedor sin operación atómica

En resolveSupplierReturn, la rama Cambio recibido calcula el nuevo stock/costo promedio y actualiza productos, movimientos y estado mediante setters del cliente. La protección de repetición usa refs locales del hook. Sin embargo, el guardado remoto no persiste cada colección por separado: `saveErpSnapshot` escribe el snapshot completo en una sola actualización condicional por `updated_at`. Por eso, dos sesiones que parten de la misma revisión no deberían confirmar ambas el mismo snapshot: la primera actualización gana y la segunda debe fallar por conflicto de revisión.

El riesgo confirmado es distinto: la sesión que pierde el conflicto ya modificó su estado local y puede mostrar temporalmente el cambio como completado mientras la sincronización queda en error. Si el usuario continúa trabajando sin recargar/sincronizar, la interfaz local puede divergir de la versión confirmada en Supabase. La ref local no sustituye una operación de negocio idempotente y transaccional en servidor, pero el control optimista de revisión sí reduce el riesgo de que ambas escrituras completas sobrescriban la misma fila.

**Severidad: media (duplicación de existencias y trazabilidad).** El riesgo depende de concurrencia entre sesiones o fallos de sincronización; no demuestra ejecución anónima.

**Corrección recomendada:** una operación transaccional de servidor que bloquee el expediente, exija estado Enviado al proveedor, compruebe idempotencia, actualice stock/costo, inserte movimientos y cambie el estado a Cambio recibido en la misma transacción. La RPC de nota de crédito ya existente no cubre esta rama de cambio recibido.

**Estado:** documentado; sin cambios funcionales, SQL ni datos.


## Hallazgo adicional: importes y costo unitario de factura editada confiados al cliente

En `updateStandardInvoice`, las cantidades de inventario se derivan de las líneas `sold`, pero el total de la factura se deriva directamente de `details.lines`; los valores de precio neto, impuesto, descuento y total de línea se copian a los renglones de venta. Además, el costo unitario utilizado para recalcular costo y utilidad proviene de `item.cost` enviado por el cliente, sin cotejarlo con el costo vigente o el costo histórico original. La función no valida que `details.lines` corresponda exactamente, una a una, con los productos/cantidades de `sold`, ni recalcula los importes a partir de valores autorizados.

Una solicitud manipulada por una sesión con capacidad de edición podría hacer que el total/CxC de la factura no coincida con las líneas que descontaron inventario, o alterar el costo/utilidad histórica de la venta. La interfaz normal construye estos datos de forma coherente, pero esa lógica cliente no constituye una barrera de integridad.

**Severidad: media-alta (integridad de facturación y rentabilidad).** Requiere capacidad de edición y manipulación de la solicitud; no demuestra acceso anónimo.

**Corrección recomendada:** la operación de servidor debe cargar la factura y sus líneas originales, validar el estado editable y las cantidades, recalcular precio/descuento/impuesto conforme a la política autorizada, conservar el costo histórico o aplicar un ajuste de costo expresamente autorizado y derivar el total/CxC de las mismas líneas validadas. Guardar líneas, total, stock, movimientos y CxC en una transacción con control de revisión e idempotencia.

**Estado:** documentado; no se añadieron validaciones cliente que aparenten ser autorización servidor, no se modificaron datos y no se ejecutó SQL.


## Hallazgo adicional: precio y costo de venta confiados al objeto enviado por el cliente

En `recordSale`, el control de inventario agrupa cantidades y comprueba existencia, pero los importes de cada `CartItem` provienen del objeto recibido. `applySaleToInventory` valida que precio y costo sean números finitos y no negativos, pero no los coteja con el producto maestro ni con una regla autorizada de lista de precios/promoción/descuento. `buildSaleRecord` usa esos mismos valores para total, costo y utilidad. En POS el precio base se calcula en la interfaz a partir de minorista/mayorista/promoción y luego se envían los objetos descontados; en factura estándar, `details.lines` aporta además importes de línea, impuestos y descuentos que se copian al registro.

La interfaz normal presenta límites de descuento y calcula importes, pero esos controles no son autorización servidor. Una solicitud manipulada por una sesión con permiso de escritura podría enviar un precio inferior/no autorizado, un costo distinto del costo maestro o valores de impuesto/descuento que alteren total y utilidad, manteniendo cantidades y stock aparentemente válidos. El problema afecta tanto a la venta POS como a la factura estándar; la edición de factura tiene un hallazgo relacionado documentado en esta misma auditoría.

**Severidad: alta para integridad comercial/financiera.** Requiere capacidad de escritura y manipulación de la solicitud; no demuestra acceso anónimo ni acceso a otra cuenta.

**Corrección recomendada:** la operación de servidor debe recibir identificadores de producto/línea, cantidades, lista de precios solicitada y descuentos justificados, pero cargar desde datos autoritativos el tipo/estado del producto, precio vigente, promoción, costo aplicable e impuestos. Debe validar el permiso para descuentos especiales, calcular los totales y utilidad en servidor y escribir venta, stock, movimientos y cuenta por cobrar en una transacción idempotente. No aceptar `Product` o `CartItem` completos como fuente autoritativa de precio/costo. Para facturas estándar, validar que las líneas e importes coincidan exactamente con productos y cantidades aceptados.

**Estado:** documentado; no se cambió la lógica funcional ni se añadió una validación cliente que pudiera confundirse con seguridad servidor. No se ejecutó SQL ni se alteraron datos.
