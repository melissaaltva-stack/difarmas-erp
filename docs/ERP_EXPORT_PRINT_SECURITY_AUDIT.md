# Auditoría de exportaciones, impresión y documentos — FARMI

Rama: `security/erp-state-permission-matrix`  
Archivos revisados: `src/components/FinancialModules.tsx`, `src/utils/csv.ts`, `src/utils/csv.test.ts`, `src/components/SupplierReturns.tsx`, `src/components/StandardInvoice.tsx`, `src/components/POS.tsx`, `src/components/Inventory.tsx` y `src/components/Settings.tsx`.  
Tipo de revisión: estática y revisión de pruebas unitarias. No se ejecutaron exportaciones con datos reales ni se inspeccionaron archivos reales.

## EXPORT-01 — Posible CSV Formula Injection

**Estado: corregido en la rama; pruebas unitarias presentes.**

La exportación de reportes usa la rutina centralizada `csvCell` de `src/utils/csv.ts`. La función:
- Detecta texto que comienza, incluso tras espacios, controles ASCII o BOM, con operadores interpretables como fórmula (`=`, `+`, `-`, `@`).
- Prefija esos valores con apóstrofo para tratarlos como texto en hojas de cálculo.
- Conserva números negativos legítimos como números.
- Escapa comillas internas y encierra cada celda entre comillas.

`ReportsModule.exportExcel` utiliza `csvCell` para encabezados y filas de datos. La suite `src/utils/csv.test.ts` cubre fórmulas con los cuatro operadores, espacios iniciales, tabulador, BOM, negativos numéricos y comillas CSV.

**Límite:** las pruebas unitarias verifican la serialización; no sustituyen pruebas de apertura en todas las versiones de Excel y LibreOffice ni pruebas con datos reales. Mantener el uso de `csvCell` en cualquier nueva exportación CSV.

## EXPORT-02 — Exportación de datos sensibles sin una barrera propia visible

**Severidad: media; pendiente de diseño y validación.**

El reporte permite exportar directorios de clientes y proveedores, RTN, teléfonos, correos, direcciones, notas, límites de crédito, saldos, cobros, ventas y datos financieros. La acción descarga el archivo directamente desde el navegador.

No se observa una autorización de servidor específica para exportar ni una comprobación de permisos por categoría de reporte dentro de `exportExcel`. La protección parece depender del acceso al módulo en la interfaz; esto no equivale a autorización independiente de exportación. El snapshot completo de `erp_state` y la falta de autorización granular server-side son limitaciones adicionales.

**Recomendación:** definir permisos explícitos de exportación por rol y tipo de reporte, registrar quién exporta qué y cuándo, y minimizar columnas sensibles por defecto. Las restricciones deben aplicarse también al acceso a los datos, no solo a la navegación.

## PRINT-01 — Impresión de documentos con datos provenientes del ERP

**Severidad: baja/media; observación de robustez pendiente.**

La impresión de devoluciones abre una ventana nueva y construye el documento con `document.write`. Los campos textuales principales se escapan mediante una función local, lo cual es un control positivo. Sin embargo, cantidades y valores monetarios se interpolan directamente en el HTML. Los tipos TypeScript no garantizan que los datos almacenados en JSONB sean válidos en tiempo de ejecución.

**Recomendación:** validar tipos y rangos numéricos en la frontera de datos y escapar/serializar todos los valores dinámicos. Preferir renderizado DOM seguro o una plantilla centralizada. Añadir pruebas con datos alterados o malformados.

## PRINT-02 — Impresión de la página completa

Los módulos de POS, facturación estándar, cuentas por cobrar/pagar e inventario llaman a `window.print()`. La revisión estática no demuestra si las reglas CSS de impresión ocultan todos los paneles, controles o datos ajenos al documento que se quiere imprimir.

**Recomendación:** verificar cada flujo con vista previa de impresión, incluyendo pantalla completa, ventanas emergentes y pantallas con más de un panel. Usar una región de impresión dedicada y reglas `@media print` específicas para ocultar navegación, controles y secciones no relacionadas.

## Controles positivos

- La exportación CSV de reportes usa serialización centralizada con mitigación de fórmulas y escape de comillas.
- La exportación del catálogo HTML usa `escapeHtml` en nombres, descripciones, precios, nombre comercial y URL de imagen.
- La impresión de devoluciones escapa campos textuales del proveedor, producto, motivo, referencia y observaciones.
- El catálogo exportado permite excluir precios por defecto mediante una opción explícita.
- Los nombres de archivo descargados se generan desde una categoría fija y fecha, no desde entradas del usuario.

## Pruebas pendientes

1. Abrir archivos CSV ficticios en Excel y LibreOffice y comprobar el tratamiento de celdas neutralizadas.
2. Verificar permisos de exportación con cada rol en un entorno aislado.
3. Abrir las vistas previas de impresión de cada módulo y confirmar que no se impriman datos ajenos.
4. Probar devoluciones con valores numéricos inválidos provenientes de un snapshot de prueba.

**No se modificó código funcional, no se descargaron datos del ERP y no se realizaron exportaciones reales.**
