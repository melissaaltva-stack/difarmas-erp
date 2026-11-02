# FARMI / DIFARMAS ERP — revisión del endpoint de administración de usuarios

**Tipo:** inspección estática de `api/admin-users.ts` en la rama `security/erp-state-permission-matrix`.  
**Estado:** hallazgos verificados en el código; no se ejecutó el endpoint ni se probaron cuentas reales.

## Resumen

El endpoint valida el token de sesión con `auth.getUser(accessToken)` y usa la clave administrativa desde variables del servidor. Las acciones de listado, creación, invitación, actualización y restablecimiento de contraseña requieren que el usuario autenticado sea administrador. No se encontró exposición explícita de la clave de servicio en la respuesta.

Aun así, hay riesgos de concurrencia y validación que conviene corregir antes de confiar en el ciclo de vida de cuentas.

## Hallazgos

### ADMIN-03 — Bootstrap de administrador no es atómico
**Severidad: alta.**

La acción `bootstrap` consulta la lista de usuarios, comprueba que no haya administradores y después actualiza el metadata del usuario actual. La comprobación y la asignación son operaciones separadas. Dos solicitudes concurrentes podrían observar cero administradores y ambas promover sus respectivas cuentas.

**Recomendación:** trasladar el bootstrap a una operación atómica controlada en servidor/DB, con bloqueo transaccional o mecanismo equivalente de exclusión mutua. La operación debe comprobar y establecer el primer administrador dentro de una sola transacción. No resolverlo con una comprobación adicional en el navegador.

### ADMIN-04 — La invitación confía en el encabezado Origin para redirectTo
**Severidad: media.**

En la acción `invite`, el valor `req.headers.origin` se utiliza como `redirectTo` y solo tiene un fallback fijo. El proyecto puede tener una allowlist de redirecciones en Supabase, pero el código no limita explícitamente el origen a los dominios propios esperados.

**Recomendación:** definir una URL canónica del sitio en una variable de entorno de servidor y utilizarla para invitaciones. Si se necesita admitir varios entornos, validar contra una allowlist estricta de orígenes exactos. No reflejar cualquier Origin recibido.

### ADMIN-05 — Claims ausentes se convierten en rol Ventas y cuenta activa
**Severidad: media-alta.**

`safeUser` presenta como Ventas a un usuario sin `farmi_role`, y como activo cuando `farmi_active` no es exactamente false. La acción de actualización conserva una interpretación similar para el estado previo. Esto es una decisión de compatibilidad, no una comprobación de que la cuenta haya sido provisionada correctamente.

**Recomendación:** distinguir explícitamente cuentas pendientes/no provisionadas de cuentas Ventas activas. Inventariar metadata existente y migrar con control antes de adoptar un comportamiento fail-closed.

### ADMIN-06 — La paginación de usuarios tiene un límite silencioso
**Severidad: media.**

`listAllUsers` recorre hasta 100 páginas de 100 usuarios y luego devuelve lo acumulado sin informar si alcanzó el límite. Para el uso actual puede ser suficiente, pero una cuenta con más de 10,000 usuarios podría provocar un inventario incompleto. Esto afecta la comprobación de administrador existente y el conteo de administradores.

**Recomendación:** detectar explícitamente si se alcanzó el máximo de páginas y fallar de forma segura, o implementar paginación completa con un límite operativo documentado.

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

1. Hacer atómico el bootstrap de primer administrador.
2. Fijar/validar el origen de redirección de invitaciones.
3. Hacer explícitos los estados de metadata incompleta.
4. Detectar inventarios de usuarios truncados.
5. Confirmar si los permisos son personalizados o están limitados por rol.

**Límites:** la inspección no demuestra que estos riesgos hayan sido explotados. No confirma la configuración de redirect URLs en Supabase, las variables desplegadas ni el número real de usuarios. No se modificó el endpoint ni la configuración del proyecto.
