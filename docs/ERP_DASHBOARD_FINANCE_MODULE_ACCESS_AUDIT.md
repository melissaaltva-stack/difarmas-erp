# Auditoría de exposición de datos en Dashboard y submódulos financieros

Fecha: 2026-11-02  
Rama: `security/erp-state-permission-matrix`

## Hallazgos corregidos en la interfaz

### FIN-UI-01 — Cuentas por cobrar/pagar montaban el módulo financiero completo
La navegación permitía entrar a Finanzas cuando el usuario tenía permiso específico de Cuentas por cobrar o Cuentas por pagar. El renderizado anterior montaba `Finance` y, para Gestión, `ManagementSuite`, componentes que reciben datos financieros de varios dominios.

Corrección: al seleccionar la sección `cobrar`, FARMI monta únicamente `ReceivablesModule`; al seleccionar `pagar`, monta únicamente `PayablesModule`. El componente general `Finance` se reserva para las demás secciones de Finanzas.

### FIN-UI-02 — Dashboard mostraba cifras financieras a roles sin permiso de Finanzas
El Dashboard mostraba gastos, utilidad bruta, resultado neto, margen, punto de equilibrio, metas financieras, valoración del inventario al costo y utilidad por venta. El módulo Dashboard está incluido en roles como Ventas y Compras.

Corrección: esos indicadores, la configuración de metas y el detalle de utilidad por venta se muestran solo si el usuario tiene el permiso `finanzas`. Los indicadores operativos de ventas, stock bajo y vencimientos permanecen visibles.

## Límite de protección

Ambas correcciones restringen la interfaz y los componentes montados, pero NO implementan autorización de datos en el servidor. `useErpState` carga el snapshot completo de `erp_state` para el usuario autenticado, y las políticas RLS actuales autorizan la fila completa por propietario/rol. Por tanto, los datos de otros módulos siguen llegando al navegador. Un usuario con acceso al snapshot puede inspeccionar el contenido descargado aunque los paneles estén ocultos.

La solución definitiva requiere migrar de snapshot único a tablas por dominio con RLS granular o endpoints/RPC que comprueben permisos de servidor y devuelvan únicamente datos autorizados. No se realizó esa migración porque requiere diseño de integridad, relaciones, transacciones y plan de migración sin pérdida de datos.

## Verificación

Para el commit `2fedac4db73021229f6cd50ffd276b285ba2076f`, GitHub Actions completó correctamente:
- `npm install`
- `npm audit --audit-level=moderate` (0 vulnerabilidades en esa instalación)
- `npm run build` (TypeScript y Vite)
- `npm test`

No se modificó Supabase, no se ejecutaron migraciones, no se cambiaron datos reales, no se desplegó ni fusionó a producción.
