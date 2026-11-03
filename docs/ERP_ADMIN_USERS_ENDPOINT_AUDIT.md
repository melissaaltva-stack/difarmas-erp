# FARMI / DIFARMAS ERP — revisión del endpoint de administración de usuarios

**Tipo:** inspección estática de `api/admin-users.ts` en la rama `security/erp-state-permission-matrix`.  
**Estado:** revisión estática actualizada; los controles de paginación y redirección indicados abajo ya fueron corregidos en la rama. No se ejecutó el endpoint ni se probaron cuentas reales.

## Resumen

El endpoint valida el token de sesión con `auth.getUser(accessToken)` y usa la clave administrativa desde variables del servidor. Las acciones de listado, creación, invitación, actualización y restablecimiento de contraseña requieren que el usuario autenticado sea administrador. No se encontró exposición explícita de la clave de servicio en la respuesta.

Aun así, hay riesgos de concurrencia y validación que conviene corregir antes de confiar en el ciclo de vida de cuentas.

## Hallazgos

### ADMIN-03 — Bootstrap de administrador no es atómico
**Severidad: alta.**

La acción `bootstrap` consulta la lista de usuarios, comprueba que no haya administradores y después actualiza el metadata del usuario actual. La comprobación y la asignación son operaciones separadas. Dos solicitudes concurrentes podrían observar cero administradores y ambas promover sus respectivas cuentas.

**Recomendación:** trasladar el bootstrap a una operación atómica controlada en servidor/DB, con bloqueo transaccional o mecanismo equivalente de exclusión mutua. La operación debe comprobar y establecer el primer administrador dentro de una sola transacción. No resolverlo con una comprobación adicional en el navegador.

### ADMIN-04 — Redirección de invitaciones basada en URL del servidor
**Estado: corregido en rama.**

La acción `invite` ya no utiliza `req.headers.origin`. Usa `FARMI_SITE_URL` configurada en el servidor y valida que la URL sea HTTPS (se admite localhost para desarrollo). Si la configuración es inválida, la invitación se detiene con error 503. El fallback es el dominio principal conocido de FARMI.

**Pendiente operativo:** configurar `FARMI_SITE_URL` en cada entorno Preview/Production y confirmar que el destino esté permitido en Supabase Auth Redirect URLs. Si el envío de invitación funciona pero falla la asignación de metadata, el endpoint intenta borrar la invitación incompleta; si la limpieza falla, devuelve un error explícito para revisión manual.

### ADMIN-05 — Claims ausentes se convierten en rol Ventas en la presentación
**Severidad: media.**

`safeUser` todavía muestra como Ventas a una cuenta sin `farmi_role` y puede presentarla como activa por compatibilidad. Sin embargo, las acciones administrativas distintas de `status` y `bootstrap` ahora exigen `farmi_active === true`; un claim ausente ya no autoriza la gestión de cuentas. El inventario previo de cuentas activas confirmó que las cuentas existentes tenían `farmi_active=true`.

**Pendiente:** representar explícitamente cuentas no provisionadas en la interfaz, sin asignarles visualmente un rol ordinario.

### ADMIN-06 — Paginación de usuarios con límite explícito
<badge>Corregido en rama</badge>

`listAllUsers` ahora falla de forma segura si la página 100 devuelve 100 registros. No devuelve un inventario posiblemente truncado para bootstrap ni para el control de última cuenta administradora. El mensaje indica que se requiere revisión manual.

### ADMIN-07 — La validación de permisos permite cualquier combinación de módulos conocidos
**Severidad: media; depende del diseño esperado.**

`safePermissions` elimina valores desconocidos y duplicados, pero para roles distintos de Administrador permite cualquier combinación de módulos conocidos. No aplica un máximo definido por `ROLE_PERMISSIONS[role]`.

Esto parece intencional si el administrador puede personalizar permisos por usuario. Si la regla de negocio pretende que el rol imponga un techo, actualmente no se cumple.

**Recomendación:** decidir y documentar uno de estos modelos:
- **Permisos personalizados:** cualquier módulo permitido en el catálogo puede asignarse individualmente; el rol es una etiqueta informativa.
- **Permisos acotados por rol:** la lista final es la intersección entre permisos solicitados y permisos máximos del rol.

No cambiarlo sin confirmar compatibilidad con los usuarios existentes.

## Controles positivos observados

- El endpoint requiere POST y rechaza otros métodos.
- Usa `Cache-Control: no-store` y `Vary: Authorization`.
- Valida el access token consultando Supabase Auth.
- La clave administrativa se lee desde variables de entorno del servidor.
- Las acciones administrativas ordinarias requieren una cuenta reconocida como Administrador.
- Las contraseñas creadas/restablecidas tienen una longitud mínima de 12 caracteres.
- Se impide desactivar o degradar a la última cuenta administradora detectada por el listado.
- Las respuestas de usuario se construyen con `safeUser`, sin incluir tokens ni secretos.

## Prioridad sugerida

1. Hacer atómico el bootstrap de primer administrador y la protección de última cuenta administradora (requiere coordinación transaccional en servidor/DB).
2. Configurar `FARMI_SITE_URL` y validar Redirect URLs en Supabase Auth.
3. Representar explícitamente en la interfaz las cuentas con metadata incompleta.
4. Confirmar si los permisos son personalizados o están limitados por rol.

**Límites:** la inspección no demuestra que estos riesgos hayan sido explotados. No confirma la configuración de redirect URLs en Supabase, las variables desplegadas ni el número real de usuarios. No se modificó el endpoint ni la configuración del proyecto.
