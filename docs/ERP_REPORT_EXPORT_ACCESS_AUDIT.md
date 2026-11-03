# Auditoría de acceso a reportes y exportaciones

Fecha: 2026-11-02  
Rama: `security/erp-state-permission-matrix`

## Cambio aplicado

El módulo `ReportsModule` ahora recibe la matriz efectiva de permisos del usuario desde `App.tsx` y construye una lista permitida de reportes. Los selectores solo muestran reportes asociados a módulos autorizados. Los handlers de exportación CSV, descarga de catálogo e impresión comprueban que el reporte seleccionado esté permitido. La opción de incluir precios en el catálogo requiere además permiso de Finanzas o Compras.

Matriz implementada:
- `catalogo`, `inventario`, `movimientos`: `inventario`
- `resumen`, `gastos`, `cierres`, `caja`: `finanzas`
- `cobrar`: `cuentas_cobrar`
- `pagar`: `cuentas_pagar`
- `cobros`: cualquiera de `finanzas`, `cuentas_cobrar`, `cuentas_pagar`
- `ventas`: `ventas`
- `compras`, `demanda`: `compras`
- `clientes`: `clientes`
- `proveedores`: `proveedores`

## Limitación de seguridad importante

Este cambio es una restricción de interfaz y de los handlers en el navegador. No constituye autorización de servidor. El cliente ERP actualmente descarga un snapshot amplio de `erp_state` y RLS autoriza la fila completa por propietario/rol; JSONB no aplica permisos por clave. Por ello, un usuario autenticado con acceso al snapshot podría inspeccionar datos en memoria o manipular el cliente y obtener datos de otros módulos. Ocultar opciones de reportes no evita esa exposición.

No se debe describir este cambio como una barrera de seguridad de datos ni como protección suficiente de exportaciones sensibles. Para una solución real, se requiere separar datos sensibles en tablas con RLS granular o exponer vistas/RPC/endpoints de servidor que verifiquen claims y permisos en cada solicitud y devuelvan solo los campos autorizados. Las exportaciones deberían auditar actor, fecha, tipo de reporte y columnas incluidas.

## Verificación

GitHub Actions ejecutó satisfactoriamente instalación, `npm audit`, compilación TypeScript/Vite y pruebas Vitest para el commit que contiene el cambio de permisos de reportes. No se realizaron exportaciones de datos reales ni se modificó la base de datos.

## Archivos

- `src/components/FinancialModules.tsx`
- `src/App.tsx`

No se modificó producción, datos Supabase ni se fusionó la rama.


## EXPORT-03 — Costos internos expuestos en reportes de inventario

**Severidad: media-alta.**

La matriz de reportes habilitaba `inventario` y `movimientos` solo con el permiso `inventario`, pero sus columnas incluían costo unitario, valor total al costo y costo unitario de movimientos. El catálogo ya exigía Finanzas o Compras para mostrar precios, pero esa restricción no se aplicaba a estos dos reportes.

**Corrección de defensa en profundidad aplicada en esta rama:** el reporte visual y la exportación CSV ahora omiten las columnas de costo y precios del inventario y el costo unitario de movimientos salvo que el usuario tenga además `finanzas` o `compras`. Se mantiene el resto de las columnas operativas.

**Límite:** la corrección es del lado del cliente y no protege contra inspección/manipulación del snapshot completo `erp_state`. No reemplaza autorización de servidor ni separación de datos por RLS.

**Verificación pendiente:** compilación, pruebas y despliegue Preview del commit de corrección. No se exportaron datos reales ni se modificó Supabase o producción.


## EXPORT-04 — Historial de cobros y pagos mezcla permisos de cuentas

**Severidad: media-alta.**

El reporte `cobros` estaba disponible si el usuario tenía cualquiera de los permisos `finanzas`, `cuentas_cobrar` o `cuentas_pagar`, pero la colección exportada y mostrada incluía simultáneamente transacciones `Cobro` y `Pago proveedor`. Un usuario con solo Cuentas por cobrar podía consultar pagos a proveedores, y viceversa.

**Corrección de interfaz aplicada en esta rama:** el historial filtra `Cobro` con `finanzas` o `cuentas_cobrar`, y `Pago proveedor` con `finanzas` o `cuentas_pagar`. La misma colección filtrada alimenta la tabla y el CSV.

**Límite:** como el snapshot completo sigue estando en el navegador, esto no sustituye la autorización del servidor. Los datos deben separarse o entregarse por endpoints/RPC con permisos por operación.

**Verificación pendiente:** pruebas, compilación y Preview del commit. Sin cambios en Supabase ni producción.


## PERM-04 — CRM visible y editable desde Gestión sin permiso Clientes

**Severidad: media.**

La sección de Gestión y análisis se presenta dentro de Finanzas. Su componente `ManagementSuite` renderizaba `CustomerCRM` sin comprobar el permiso `clientes`; el CRM mostraba datos de clientes y permitía agregar registros a través de `setCustomers`. Por ello, una cuenta con Finanzas pero sin Clientes podía consultar y modificar el directorio desde el área gerencial.

**Corrección de interfaz aplicada en esta rama:** `App.tsx` pasa `canSee('clientes')` a `ManagementSuite`; el panel CRM solo se renderiza cuando `canManageCustomers` es verdadero. Las demás herramientas de análisis gerencial permanecen disponibles.

**Límite:** la autorización sigue siendo cliente-side mientras el snapshot completo se sincronice como JSON. La protección definitiva requiere validar permisos en servidor.

**Verificación pendiente:** build, pruebas y Preview. No se modificaron datos ni configuración de Supabase, y no se publicó a producción.
