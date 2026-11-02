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
