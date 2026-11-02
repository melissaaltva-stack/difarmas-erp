# Auditoría de acceso del Asistente IA

Fecha: 2026-11-02  
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

## Verificación y corrección de compilación

- Commit `4069171f501cab7de280139ac33569d4a749695b`: extracción de la función de filtrado.
- Commit `2af131bb97b4145ff3500c139f506f7db99a52d1`: pruebas unitarias. GitHub Actions completó correctamente instalación, auditoría de dependencias, compilación y pruebas.
- El primer despliegue del cambio del asistente falló por una referencia de TypeScript al nombre anterior de unas variables de permisos. Se corrigió en commit `a84be4a6e9e145d5f0a4b7430561d1a93bf98c6c`.
- Al redactar este informe, Vercel aún estaba compilando el último commit; no se afirma que ese despliegue haya terminado correctamente.

## Límite importante

Este ajuste evita que el asistente presente resúmenes de módulos no autorizados. No crea una frontera de seguridad de servidor: `App.tsx` sigue teniendo el snapshot completo de `erp_state` en memoria y pasa referencias de datos al componente. La autorización definitiva exige separar dominios en Supabase o usar RPC/endpoints que comprueben permisos y devuelvan únicamente los datos permitidos.

No se cambió la base de datos, no se ejecutaron migraciones, no se tocaron datos reales y no se fusionó ni desplegó a producción.
