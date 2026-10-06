# DIFARMÁS ERP v1.0.0

ERP web para la gestión integral de DIFARMÁS.

## Módulos principales

- Dashboard ejecutivo y metas
- POS / ventas minoristas y mayoristas
- Inventario y compras
- Cuentas por cobrar y pagar
- Caja, movimientos y cierres diarios
- Finanzas y control de gastos
- Rentabilidad, precios y punto de equilibrio
- Promociones y campañas
- CRM y recuperación de clientes
- Venta cruzada y oportunidades comerciales
- Pronósticos, escenarios y alertas
- Tareas y centros de decisión ejecutiva

## Persistencia

Los datos operativos del MVP se guardan localmente en el navegador mediante localStorage. La arquitectura queda preparada para una futura API y PostgreSQL.

## Calidad

GitHub Actions ejecuta automáticamente el build en cada push a main y Pull Request.

## Stack

- React
- TypeScript
- Vite
- lucide-react
- CSS

## Estado

**v1.0.0 — consolidación del ERP MVP.**

La siguiente etapa recomendada es separar la lógica de negocio de App.tsx, agregar pruebas automatizadas y preparar la migración de localStorage hacia API/PostgreSQL.

<!-- CI verification: 2026-10-05 -->
<!-- CI cache fix verified -->
