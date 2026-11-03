# Auditoría de cadena de suministro y CI — FARMI

Rama revisada: `security/erp-state-permission-matrix`  
Archivos: `package.json`, `.github/workflows/ci.yml`, `.github/workflows/deploy-pages.yml`, `.env.example`, `.gitignore`.  
Revisión estática de GitHub; no se ejecutó npm install, npm audit ni build.

## Hallazgo SUPPLY-01 — Dependencias principales no están fijadas

**Severidad: alta para reproducibilidad y riesgo de cadena de suministro.**

En `package.json` varias dependencias principales usan la etiqueta móvil `latest` (React, React DOM, Vite, TypeScript, plugin React y tipos). La raíz de la rama revisada no muestra un `package-lock.json`.

Los workflows ejecutan `npm install`, por lo que una ejecución futura puede resolver versiones distintas aunque el código fuente no cambie. Esto hace menos reproducibles los builds y dificulta identificar qué versión exacta se auditó.

**Recomendación:** fijar versiones compatibles, generar y confirmar `package-lock.json`, y cambiar los workflows a `npm ci`. Actualizar dependencias mediante cambios revisados y auditables, no resolviendo `latest` en cada build.

## Hallazgo SUPPLY-02 — Las GitHub Actions se referencian por etiquetas, no por SHA

**Severidad: media.**

Los workflows usan referencias como `actions/checkout@v4`, `actions/setup-node@v4`, `actions/upload-pages-artifact@v3` y `actions/deploy-pages@v4`. Las etiquetas son cómodas, pero no fijan criptográficamente el commit exacto que ejecutará el runner.

**Recomendación:** fijar cada acción de terceros a un SHA completo verificado y mantener un comentario con su versión legible. Automatizar actualizaciones revisadas (por ejemplo, Dependabot).

## SUPPLY-03 — Cobertura CI de la rama de auditoría

**Estado: corregido en la configuración de esta rama.**

La versión actual de `.github/workflows/ci.yml` ya incluye `security/erp-state-permission-matrix` en los triggers de `push`, además de `main`, `ci/verify-build` y `refactor/erp-architecture`. Los Pull Requests hacia `main` también disparan el workflow.

**Estado:** el defecto descrito en la revisión anterior ya no está presente en el archivo actual de esta rama. La presencia del trigger no equivale a un CI exitoso; cada ejecución debe verificarse en GitHub.

## Hallazgo SUPPLY-04 — El workflow de despliegue instala dependencias sin lockfile

**Severidad: media.**

`.github/workflows/deploy-pages.yml` usa `npm install` antes del build y despliega automáticamente ante push a `main`. Al no existir lockfile en la raíz revisada, el contenido de dependencias puede variar entre despliegues.

**Recomendación:** adoptar `npm ci` con lockfile comprometido. Mantener separado el build del despliegue y exigir que build, pruebas y auditoría de dependencias terminen satisfactoriamente antes de publicar.

## Controles positivos

- `.gitignore` excluye `.env` y `.env.*`, con excepción explícita de `.env.example`.
- `.env.example` contiene solo placeholders y documenta que se debe usar la clave pública de Supabase.
- El workflow de Pages define permisos explícitos mínimos para contenido de solo lectura, Pages e identidad OIDC.
- El workflow de CI incluye auditoría de dependencias con umbral moderate y ejecuta build y pruebas.
- El workflow de despliegue comprueba que existan las dos variables públicas requeridas antes de compilar.
- No se observa una clave service-role en los archivos revisados.

## Acciones recomendadas, sin aplicarlas todavía

1. Fijar versiones y agregar lockfile.
2. Cambiar `npm install` por `npm ci`.
3. Fijar GitHub Actions por SHA.
4. Hacer que la rama de seguridad reciba CI en cada push.
5. Exigir CI exitoso antes de fusionar a main y desplegar.

**Límite de esta revisión:** no se inspeccionaron los valores de secretos de GitHub/Vercel ni se ejecutó el pipeline. La presencia de nombres de variables en YAML no demuestra que estén configuradas correctamente.
