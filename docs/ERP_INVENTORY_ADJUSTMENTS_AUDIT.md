# Auditoría de ajustes y conservación del historial de inventario

Rama: `security/erp-state-permission-matrix`

Fecha de revisión: 2026-11-04.

Alcance: revisión estática de `src/hooks/useErpState.ts`, `src/domain/types.ts` y `src/components/Inventory.tsx`.

No se modificó código operativo, no se ejecutaron migraciones, no se modificaron datos de Supabase y no se desplegó a producción.

## Hallazgos

### INV-06. Los ajustes manuales de existencias no exigen motivo estructurado ni autorización

Severidad: alta para trazabilidad del inventario.

En `saveProduct`, cuando se edita un producto, el sistema acepta el nuevo valor de `stock` enviado desde el formulario y actualiza el catálogo. Si el stock cambió, agrega un movimiento de tipo `Ajuste` con cantidad absoluta, stock anterior/posterior, costo y una nota genérica («Ajuste de entrada manual» o «Ajuste de salida manual»). No se exige causa específica, documento fuente, actor, aprobador ni evidencia. El tipo `InventoryMovement` tampoco contiene campos para esos datos.

**Impacto:** el historial permite ver que hubo una diferencia, pero no quién la autorizó, por qué se hizo ni qué documento la respalda. Un ajuste manual puede encubrir diferencias por pérdida, daño, vencimiento, conteo físico o error de recepción sin que los reportes puedan distinguirlos.

**Corrección requerida:** separar el cambio de ficha del ajuste de existencias. El ajuste debe registrar cantidad, motivo tipificado, comentario, actor, fecha de servidor, referencia/evidencia y aprobación según umbral. Los campos de stock en edición de producto deben ser de solo lectura, salvo un flujo dedicado de ajuste. El saldo debe calcularse y validarse contra el stock vigente en una operación transaccional.

### INV-07. Eliminar un producto borra su ficha maestra aunque existan referencias históricas

Severidad: alta para conservación y conciliación de registros.

La función `deleteProduct` crea un movimiento de salida por el stock restante (si el producto tiene existencias positivas) y luego elimina el producto de `products`. No verifica si el producto aparece en ventas, compras, historial de costos, devoluciones, solicitudes o movimientos anteriores. El modelo `Product` no contiene un estado de archivado/inactivo. El formulario de producto confirma la acción con un diálogo del navegador, pero no muestra el impacto sobre referencias históricas ni solicita motivo estructurado.

**Impacto:** la ficha maestra y sus atributos actuales dejan de estar disponibles en el catálogo aunque existan operaciones históricas vinculadas por `productId`. Aunque algunos documentos guardan una copia del nombre, se pierde la referencia central para consultar código, categoría, laboratorio, presentación, lote y otros atributos. El historial conserva IDs y textos parciales, pero no sustituye una ficha histórica inmutable.

**Corrección requerida:** sustituir la eliminación física por archivado/baja lógica. Impedir borrar productos con referencias transaccionales; conservar su ficha y código para consulta histórica, pero excluirlos de nuevas ventas, compras y selección operativa. La disposición del stock restante debe registrarse en un movimiento separado con motivo, actor, evidencia y aprobación. Para productos sin movimientos ni referencias se puede definir una eliminación controlada y auditada.

### INV-08. Los movimientos de inventario no permiten reconstruir una trazabilidad completa del ajuste

Severidad: alta para auditoría y conciliación.

El tipo `InventoryMovement` solo conserva ID, producto, tipo genérico (`Venta`, `Compra`, `Ajuste`), cantidad, stock antes/después, costo unitario, referencia opcional, fecha y nota libre. La vista «Historial de movimientos» presenta los últimos 20 registros y no expone referencia documental navegable, actor, motivo estructurado, aprobación, lote ni estado de disposición. Los ajustes de stock desde `saveProduct` no enlazan un documento de ajuste independiente; los movimientos por eliminación enlazan el ID del producto eliminado, no una autorización o expediente de baja.

**Impacto:** el historial no constituye un libro auxiliar completo que permita reconstruir origen, responsable, autorización y destino de cada variación. El texto libre no permite clasificar ni conciliar consistentemente conteos, mermas, vencimientos, daños, devoluciones y bajas.

**Corrección requerida:** establecer un expediente de movimiento inmutable con origen tipificado, referencia de documento, producto/lote, unidades, saldos, costo, motivo, actor, fecha de servidor, evidencia y aprobación. La interfaz debe permitir consultar el expediente completo y filtrar por periodo, producto, lote, motivo y responsable. Mantener compatibilidad de lectura con movimientos históricos sin completar datos faltantes por inferencia.

## Evidencia de código observada

- `src/hooks/useErpState.ts`: `saveProduct` actualiza directamente `products` y registra un movimiento genérico cuando cambia `stock`.
- `src/hooks/useErpState.ts`: `deleteProduct` registra una salida por el stock restante y elimina el producto de `products`.
- `src/domain/types.ts`: `Product` no tiene estado de archivado; `InventoryMovement` no contiene actor, aprobación, motivo estructurado, lote ni evidencia.
- `src/components/Inventory.tsx`: el formulario de producto ofrece «Eliminar producto» y confirma con `window.confirm`; el historial presenta solo los últimos 20 movimientos.

## Pruebas requeridas antes de corregir

1. Intentar ajustar stock sin motivo y comprobar que el flujo lo rechaza.
2. Ajuste de entrada/salida con actor, aprobación y documento válido.
3. Dos ajustes concurrentes sobre el mismo producto: no deben sobrescribir el saldo ni duplicar movimientos.
4. Intentar eliminar producto usado en venta, compra, devolución o movimiento: debe archivarse, no borrarse.
5. Verificar que un producto archivado no pueda añadirse a POS ni a nuevas compras, pero siga visible en ventas y reportes históricos.
6. Baja de existencias con conciliación entre saldo anterior, cantidad dada de baja y saldo final.
7. Verificar que todos los movimientos nuevos tengan expediente y referencia trazable.

## Limitaciones

Esta revisión es estática y no demuestra el comportamiento bajo concurrencia real ni la integridad de una transacción de servidor. Los hallazgos identifican brechas del modelo y del flujo cliente; su corrección integral requiere un diseño transaccional y pruebas con datos de prueba aislados. No se aplicaron cambios de esquema ni se alteró información existente.
