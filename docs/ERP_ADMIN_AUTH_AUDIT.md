# Auditoría de administración de usuarios y autenticación

Rama: `security/erp-state-permission-matrix`
Fecha: 2026-11-04
Archivo revisado: `api/admin-users.ts` (SHA `6f4a603324c170d2b7b2113b50096b9b732aa870`) y flujo de administración de `src/components/Settings.tsx`.
Alcance: revisión estática. No se modificó código operativo, configuración de Supabase, cuentas ni datos. No se ejecutaron pruebas concurrentes ni pruebas contra Auth.

## Controles confirmados

- El endpoint exige POST (excepto OPTIONS), responde con `Cache-Control: no-store` y `Vary: Authorization`.
- Valida el Bearer token mediante `auth.getUser(accessToken)` en Supabase antes de las acciones administrativas.
- Las acciones de gestión ordinaria exigen `farmi_active === true` y un administrador activo.
- Los permisos enviados se filtran contra una lista cerrada de módulos; el rol Administrador recibe todos los módulos.
- La contraseña inicial y los cambios de contraseña exigen al menos 12 caracteres.
- La URL de redirección de invitaciones procede de configuración del servidor, no del encabezado Origin, y exige HTTPS salvo localhost.
- La creación de usuario con nombre de usuario usa la unicidad de Supabase Auth para el correo sintético, evitando una comprobación previa susceptible a carrera.
- El listado de usuarios falla cerrado si supera el límite de paginación configurado, en vez de hacer una comprobación parcial.
- Los errores administrativos devueltos al cliente no exponen detalles internos del proveedor.

## Hallazgos abiertos

### ADMIN-CONC-01 — Carrera al proteger la última cuenta administradora
**Severidad: Crítica.** La acción `update` obtiene una lista de usuarios, calcula `adminCount` y luego actualiza la cuenta objetivo mediante Auth Admin API. Dos solicitudes concurrentes pueden leer el mismo estado y ejecutar cambios incompatibles. La comprobación de última cuenta no es atómica con la actualización.

**Cierre:** mover la invariancia a una operación serializada/atómica del lado servidor, con bloqueo o mecanismo equivalente y pruebas concurrentes. La comprobación en el endpoint debe permanecer como validación adicional, no como garantía única.

### ADMIN-CONC-02 — Activación inicial no atómica
**Severidad: Crítica.** La acción `bootstrap` valida el token, lista usuarios y comprueba que no exista administrador; después actualiza la metadata del usuario. Dos solicitudes válidas simultáneas pueden pasar la comprobación antes de que alguna actualización sea visible.

**Cierre:** bootstrap de un solo uso coordinado atómicamente en backend. No basta con deshabilitar el botón o utilizar un bloqueo en memoria.

### ADMIN-RATE-01 — Sin límite persistente de intentos visible en el endpoint
**Severidad: Alta.** El endpoint compara el token de bootstrap en tiempo constante, pero en el código revisado no hay contador persistente, enfriamiento ni limitación por IP/cuenta para intentos fallidos. La protección depende de la confidencialidad y fortaleza del secreto y de controles externos que no se verificaron.

**Cierre:** añadir limitación de tasa del lado servidor y alertas/auditoría sin registrar el token. Verificar aparte la configuración del perímetro de Vercel. No se presupone que exista un límite externo.

### ADMIN-INV-01 — Invitación y asignación de permisos son dos operaciones
**Severidad: Media/Alta.** `inviteUserByEmail` y `updateUserById` no forman una transacción. El código intenta compensar borrando la cuenta si falla la asignación; si la limpieza también falla, responde con error y advierte que requiere revisión manual. Es una mitigación útil, no atomicidad.

**Cierre:** conservar el manejo compensatorio, agregar registro de auditoría/alerta de cuentas huérfanas y diseñar reconciliación segura. No convertir el fallo parcial en éxito.

### ADMIN-AUD-01 — Acciones administrativas sin expediente de auditoría propio
**Severidad: Alta para trazabilidad.** En el flujo revisado no se observa un registro persistente e inmutable que identifique actor, objetivo, acción, valores anteriores/nuevos, fecha del servidor y resultado para altas, invitaciones, cambios de rol/estado y restablecimientos de contraseña.

**Cierre:** registrar eventos administrativos en backend, sin guardar contraseñas, tokens ni secretos; restringir lectura y evitar que el mismo cliente pueda alterar el historial.

### AUTH-SESSION-01 — Propagación de cambios y revocación de sesiones no demostradas
**Severidad: Alta.** El endpoint actualiza `app_metadata` y puede aplicar ban a cuentas inactivadas, pero esta revisión no ejecutó pruebas que demuestren el tiempo de propagación a sesiones/JWT ya emitidos ni el rechazo inmediato en todas las rutas del ERP.

**Cierre:** pruebas de integración para desactivar, cambiar rol y retirar permisos con sesiones abiertas en varios dispositivos. Las rutas de datos deben consultar autorización vigente en servidor; no depender exclusivamente de claims antiguos.

## Interpretación de `status`

La acción `status` informa `canBootstrap` cuando el solicitante no es administrador y el secreto está configurado. No comprueba si ya existe otro administrador. Esto puede mostrar el formulario de activación a una cuenta que luego recibirá 409 al ejecutar bootstrap; por sí solo no concede privilegios ni evita la comprobación global de la acción.

## Pruebas pendientes obligatorias

1. Dos solicitudes simultáneas intentando degradar/desactivar las dos últimas cuentas administradoras: debe conservarse siempre al menos una.
2. Dos solicitudes simultáneas de bootstrap con token válido: solo una debe poder establecer la primera cuenta administradora.
3. Ráfaga de tokens incorrectos: aplicar límite persistente y respuesta controlada.
4. Fallo simulado entre invitación y asignación de metadata, incluyendo fallo de limpieza: detectar y reconciliar la cuenta huérfana.
5. Desactivar/cambiar rol de un usuario con sesión abierta en otro dispositivo y comprobar rechazo de operaciones protegidas.
6. Confirmar que cada acción administrativa genera un evento de auditoría sin secretos.

## Estado de cierre

- **Controles observados en código:** autenticación de token en servidor, validación de administrador activo, lista cerrada de permisos, comprobación de última cuenta, compensación de invitación y errores genéricos.
- **No corregido:** ADMIN-CONC-01, ADMIN-CONC-02, ADMIN-RATE-01, ADMIN-INV-01 y ADMIN-AUD-01.
- **No verificado:** AUTH-SESSION-01 y controles perimetrales de rate limiting.
- **No probado:** concurrencia real, revocación entre dispositivos y fallos parciales contra un entorno aislado.

Estos hallazgos no autorizan a cambiar la base activa. La solución de concurrencia requiere diseño y validación en un entorno de pruebas aislado antes de cualquier migración o despliegue operativo.
