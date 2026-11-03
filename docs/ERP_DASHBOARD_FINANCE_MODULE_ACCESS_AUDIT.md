# Auditoría de exposición de datos en Dashboard y submódulos financieros

Fecha: 2026-11-03  
Rama: `security/erp-state-permission-matrix`

## Hallazgos corregidos en la interfaz

### FIN-UI-01 — Cuentas por cobrar/pagar montaban el módulo financiero completo

La navegación permitía entrar a Finanzas cuando el usuario tenía permiso específico de Cuentas por cobrar o Cuentas por pagar. El renderizado anterior montaba `Finance` y, para Gestión, `ManagementSuite`, componentes que reciben datos financieros de varios dominios.

**Corrección:** al seleccionar la sección `cobrar`, FARMI monta únicamente `ReceivablesModule`; al seleccionar `pagar`, monta únicamente `PayablesModule`. El componente general `Finance` se reserva para las demás secciones de Finanzas.

### FIN-UI-02 — Dashboard mostraba cifras financieras a roles sin permiso de Finanzas

El Dashboard mostraba gastos, utilidad bruta, resultado neto, margen, punto de equilibrio, metas financieras, valoración del inventario al costo y utilidad por venta. El módulo Dashboard está incluido en roles como Ventas y Compras.

**Corrección:** esos indicadores, la configuración de metas y el detalle de utilidad por venta se muestran solo si el usuario tiene el permiso `finanzas`.

### FIN-UI-03 — Dashboard mostraba ventas a usuarios sin permiso de Ventas

**Severidad: media; exposición de información comercial dentro de la interfaz.**

Aunque el usuario tuviera solo el módulo Dashboard (por ejemplo, el preset Compras), el panel mostraba ventas del día, ventas acumuladas, número de operaciones, últimas ventas y gráfico de ventas. El permiso Dashboard no equivale automáticamente al permiso Ventas.

**Corrección aplicada en la rama:** se agregó el alcance `canViewSales`. Los datos y componentes de ventas se muestran únicamente con permiso `ventas` o `finanzas`. Finanzas conserva acceso a indicadores comerciales necesarios para el resumen financiero.

### FIN-UI-04 — Alertas de inventario visibles sin permiso de Inventario

**Severidad: baja/media; exposición de conteos operativos.**

El panel mostraba conteos de productos bajo mínimo y próximos a vencer a cualquier usuario con acceso a Dashboard, aunque no tuviera el módulo Inventario.

**Corrección aplicada en la rama:** se agregó `canViewInventory`. Las alertas de stock y vencimiento solo se calculan y presentan cuando existe permiso `inventario`. La valoración monetaria del inventario permanece bajo `finanzas`, por ser un indicador financiero.

## Límite de protección

Estas correcciones restringen la interfaz y los datos usados para calcular los indicadores, pero NO implementan autorización de datos en el servidor. `useErpState` carga el snapshot completo de `erp_state` para el usuario autenticado, y las políticas RLS actuales autorizan la fila completa por propietario/rol. Por tanto, los datos de otros módulos siguen llegando al navegador. Un usuario con acceso al snapshot podría inspeccionar el contenido descargado aunque los paneles estén ocultos.

La solución definitiva requiere migrar de snapshot único a tablas por dominio con RLS granular o endpoints/RPC que comprueben permisos de servidor y devuelvan únicamente datos autorizados. No se realizó esa migración porque requiere diseño de integridad, relaciones, transacciones y plan de migración sin pérdida de datos.

## Verificación

Los cambios FIN-UI-03/04 están en `src/components/Dashboard.tsx` y el alcance se deriva de claims de permisos en `src/App.tsx`. GitHub Actions run `41709639705` para el commit `48b6923234fa5ed434227408951230df74d102e1` terminó con conclusión `success`; completó instalación, auditoría de dependencias, build y pruebas.

No se modificó Supabase, no se ejecutaron migraciones, no se cambiaron datos reales ni se fusionó a producción.
