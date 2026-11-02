# Auditoría de exportaciones, impresión y documentos — FARMI

Rama: `security/erp-state-permission-matrix`  
Archivos revisados: `src/components/FinancialModules.tsx`, `src/components/SupplierReturns.tsx`, `src/components/StandardInvoice.tsx`, `src/components/POS.tsx`, `src/components/Inventory.tsx` y `src/components/Settings.tsx`.  
Tipo de revisión: estática; no se ejecutaron exportaciones ni se inspeccionaron archivos reales.

## EXPORT-01 — Posible CSV Formula Injection

**Severidad: media; requiere confirmar con pruebas controladas.**

En `ReportsModule`, `exportExcel` convierte cada valor a texto y lo envuelve entre comillas, duplicando comillas internas. No neutraliza contenido que comienza con caracteres interpretables como fórmula por hojas de cálculo (por ejemplo `=`, `+`, `-` o `@`, incluso precedidos por espacios o controles).

El reporte incluye campos editables o importados como nombres, notas, descripciones, direcciones, datos de clientes/proveedores y referencias. Si alguno contiene una cadena de fórmula y el CSV se abre en una hoja de cálculo compatible, podría ejecutarse como fórmula al abrir el archivo.

**Recomendación:** neutralizar valores de texto peligrosos antes de construir CSV (por ejemplo, prefijo de texto seguro/apóstrofo y pruebas con Excel y LibreOffice). Mantener números como números y no alterar signos negativos legítimos. Aplicar una rutina centralizada a todos los reportes y validar casos con espacios iniciales, tabuladores y saltos de línea.

## EXPORT-02 — Exportación de datos sensibles sin una barrera propia visible

**Severidad: media; depende del control de acceso del módulo.**

El reporte permite exportar directorios de clientes y proveedores, RTN, teléfonos, correos, direcciones, notas, límites de crédito, saldos, cobros, ventas y datos financieros. La acción descarga el archivo directamente desde el navegador.

En el fragmento revisado no se observa una autorización de servidor específica para exportar ni una comprobación de permisos por categoría de reporte dentro de `exportExcel`. La protección parece depender de que el usuario pueda acceder al módulo en la interfaz; esto no equivale a una autorización independiente de exportación.

**Recomendación:** definir permisos explícitos de exportación por rol y tipo de reporte, registrar quién exporta qué y cuándo, y minimizar columnas sensibles por defecto. Verificar que las restricciones de módulo se apliquen también al acceso a los datos, no solo a la navegación.

## PRINT-01 — Impresión de documentos con datos provenientes del ERP

**Severidad: baja/media; observación de robustez.**

La impresión de devoluciones abre una ventana nueva y construye el documento con `document.write`. Los campos textuales principales se escapan mediante una función local, lo cual es un control positivo. Sin embargo, cantidades y valores monetarios se interpolan directamente en el HTML. Los tipos TypeScript no garantizan que los datos almacenados en JSONB sean válidos en tiempo de ejecución.

**Recomendación:** validar tipos y rangos numéricos en la frontera de datos y escapar/serializar todos los valores dinámicos. Preferir renderizado DOM seguro o una plantilla centralizada. Añadir pruebas con datos alterados o malformados.

## PRINT-02 — Impresión de la página completa

Los módulos de POS, facturación estándar, cuentas por cobrar/pagar e inventario llaman a `window.print()`. La revisión estática no demuestra si las reglas CSS de impresión ocultan todos los paneles, controles o datos ajenos al documento que se quiere imprimir.

**Recomendación:** verificar cada flujo con vista previa de impresión, incluyendo pantalla completa, ventanas emergentes y pantallas con más de un panel. Usar una región de impresión dedicada y reglas `@media print` específicas para ocultar navegación, controles y secciones no relacionadas.

## Controles positivos

- La exportación del catálogo HTML usa `escapeHtml` en nombres, descripciones, precios, nombre comercial y URL de imagen.
- La impresión de devoluciones escapa campos textuales del proveedor, producto, motivo, referencia y observaciones.
- El catálogo exportado permite excluir precios por defecto mediante una opción explícita.
- Los nombres de archivo descargados se generan desde una categoría fija y fecha, no desde entradas del usuario.

## Pruebas pendientes

1. Probar cadenas de fórmula en nombres, notas, descripciones y campos de proveedores con datos ficticios.
2. Verificar permisos de exportación con cada rol en un entorno de pruebas.
3. Abrir las vistas previas de impresión de cada módulo y confirmar que no se impriman datos ajenos.
4. Probar devoluciones con valores numéricos inválidos provenientes de un snapshot de prueba.

**No se modificó código, no se descargaron datos del ERP y no se realizaron exportaciones reales.**
