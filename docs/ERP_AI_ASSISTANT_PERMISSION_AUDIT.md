# Auditoría de acceso del Asistente IA

Fecha: 2026-11-03  
Rama: `security/erp-state-permission-matrix`

## Hallazgo AI-ACCESS-01

El componente `AiAssistant` recibía y resumía ventas, compras, gastos, cuentas por cobrar, cuentas por pagar e inventario sin comprobar los permisos de cada módulo. Un usuario con acceso al Asistente IA podía consultar indicadores y detalles de dominios que no necesariamente tenía autorizados en el resto del ERP.

## Corrección aplicada

- Se añadió `scopeAssistantData`, una función que filtra cada conjunto de datos según permisos de módulo antes de que el asistente calcule alertas o genere respuestas.
- Inventario y movimientos requieren `inventario`.
- Ventas requieren `ventas` o `finanzas`.
- Compras requieren `compras`.
- Gastos requieren `finanzas`.
- Cuentas por cobrar requieren `cuentas_cobrar` o `finanzas`.
- Cuentas por pagar requieren `cuentas_pagar` o `finanzas`.
- Las tarjetas de indicadores se ocultan cuando el usuario no tiene el permiso del dominio correspondiente.
- `App.tsx` pasa los permisos actuales del usuario al componente.

Se añadieron pruebas unitarias para asistente sin permisos de dominio, Ventas, Inventario/Compras, Finanzas y Cuentas por cobrar.

## Hallazgo AI-ACCESS-02 — Alertas memoizadas con dependencias de permisos incompletas

**Severidad: media; fuga potencial de indicadores obsoletos tras cambiar permisos.**

Las alertas de inventario y vencimientos se calculaban a partir de `safeProducts`, que es la colección filtrada por permisos, pero los hooks `useMemo` dependían de `products` (la colección completa) en lugar de la colección filtrada. Si el permiso de inventario cambiaba mientras el componente permanecía montado y la referencia de `products` no cambiaba, el cálculo podía conservar alertas obtenidas antes de retirar el permiso.

**Corrección aplicada en la rama:** ambos `useMemo` ahora dependen de `safeProducts`. Cuando cambia el alcance autorizado, el cálculo vuelve a ejecutarse usando la colección filtrada actual.

**Límite de verificación:** corrección estática confirmada en el código. La suite existente prueba el filtrado por dominio, pero todavía no incluye una prueba de renderizado que reproduzca una actualización de permisos mientras el componente permanece montado.

## Verificación histórica de AI-ACCESS-01

- Commit `4069171f501cab7de280139ac33569d4a749695b`: extracción de la función de filtrado.
- Commit `2af131bb97b4145ff3500c139f506f7db99a52d1`: pruebas unitarias. GitHub Actions completó correctamente instalación, auditoría de dependencias, compilación y pruebas.
- El primer despliegue del cambio del asistente falló por una referencia de TypeScript al nombre anterior de unas variables de permisos. Se corrigió en commit `a84be4a6e9e145d5f0a4b7430561d1a93bf98c6c`.

## Límite importante

Estos ajustes son restricciones de interfaz y de cálculo; no crean una frontera de seguridad de servidor. `App.tsx` sigue teniendo el snapshot completo de `erp_state` en memoria y pasa referencias de datos al componente. Un usuario con acceso a ese snapshot podría inspeccionar datos de otros módulos o manipular el cliente. La autorización definitiva exige separar dominios en Supabase o usar RPC/endpoints que comprueben permisos y devuelvan únicamente los datos permitidos.

No se cambió la base de datos, no se ejecutaron migraciones, no se tocaron datos reales y no se fusionó ni desplegó a producción.
