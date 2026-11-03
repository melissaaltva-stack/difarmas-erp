# FARMI / DIFARMAS ERP — revisión del endpoint de administración de usuarios

**Tipo:** inspección estática de `api/admin-users.ts` en la rama `security/erp-state-permission-matrix`.
**Estado:** revisión estática actualizada. No se ejecutó el endpoint ni se probaron cuentas reales. No se modificó Supabase.

## Resumen

El endpoint valida el access token con `auth.getUser(accessToken)`, utiliza la clave administrativa únicamente en servidor, exige POST, evita caché de respuestas y valida que el usuario tenga el claim de administrador activo para las acciones ordinarias.

Los controles de invitación, paginación, cuentas no provisionadas y limpieza compensatoria están implementados en la rama. Persisten dos riesgos importantes de concurrencia que no se deben intentar resolver con más comprobaciones de lectura en el endpoint.

## Hallazgos

### ADMIN-03 — Bootstrap del primer administrador no es atómico
**Severidad: alta. Pendiente.**

La acción `bootstrap` comprueba el token de activación, obtiene el inventario de usuarios, comprueba que no exista una cuenta administradora y luego actualiza el metadata del usuario. La consulta y la promoción no forman una sola transacción. Dos solicitudes simultáneas podrían observar cero administradores y promover a dos usuarios.

**Recomendación:** implementar una operación atómica en PostgreSQL con bloqueo transaccional y autorización estricta, o un mecanismo equivalente de exclusión mutua del lado servidor. La comprobación y la asignación del primer administrador deben ocurrir dentro de la misma transacción. No es suficiente repetir la consulta ni bloquear solamente en el navegador.

### ADMIN-04 — Redirección de invitaciones controlada por configuración del servidor
**Estado: corregido en rama; pendiente de verificación operativa.**

La acción `invite` no utiliza `req.headers.origin`. Usa `FARMI_SITE_URL` o el fallback `https://difarmas-erp.vercel.app` y valida HTTPS (localhost se admite para desarrollo). Si la configuración no es válida, la invitación se detiene.

**Pendiente operativo:** configurar `FARMI_SITE_URL` explícitamente en Preview y Production y confirmar que el destino esté permitido en Supabase Auth Redirect URLs. La lectura previa de variables de Preview no encontró una variable explícita para esa rama; por eso el código usa el fallback. No se modificaron variables.

Si el envío de invitación funciona pero falla el guardado de metadata, el endpoint intenta borrar la cuenta incompleta. Si la limpieza también falla, devuelve un error que solicita revisión administrativa.

### ADMIN-05 — Cuentas sin metadata válida
**Estado: corregido en rama.**

`safeUser` ya no presenta cuentas no provisionadas como Ventas ni como activas. Si el rol no es válido, muestra `Solo lectura`, aplica permisos seguros de solo lectura y marca `active` únicamente cuando `farmi_active === true` y la cuenta no está baneada. Esto es una representación de seguridad; no concede permisos reales.

### ADMIN-06 — Paginación del inventario de usuarios
**Estado: corregido en rama.**

`listAllUsers` falla de forma segura si la página 100 contiene 100 registros. No usa un inventario potencialmente truncado para bootstrap ni para las verificaciones de última cuenta administradora.

### ADMIN-07 — Protección de la última cuenta administradora susceptible a carrera
**Severidad: alta. Pendiente.**

La acción `update` obtiene el listado de usuarios, cuenta administradores y luego actualiza la cuenta objetivo. Aunque bloquea la desactivación/degradación de la última cuenta detectada, dos solicitudes simultáneas podrían leer el mismo recuento y degradar cuentas distintas, dejando cero administradores. La comprobación de bootstrap tiene el mismo tipo de problema.

**Recomendación:** centralizar el cambio de rol/estado de administradores en una operación atómica que serialice las modificaciones y garantice que siempre quede al menos una cuenta administradora activa. No aplicar un cambio de esquema o función en la base activa hasta verificar el respaldo y probar la restauración en un entorno aislado.

### ADMIN-08 — Permisos personalizados por usuario
**Severidad: media; depende de la regla de negocio.**

`safePermissions` elimina valores desconocidos y duplicados, pero permite cualquier combinación de módulos conocidos para roles distintos de Administrador. El rol no limita actualmente el conjunto de permisos asignables.

**Decisión requerida de diseño:**
- Permisos personalizados: el administrador puede asignar cualquier módulo conocido individualmente.
- Permisos acotados por rol: la lista final debe ser la intersección de permisos solicitados con el máximo del rol.

No cambiarlo sin confirmar la regla de negocio y revisar usuarios existentes.

## Controles positivos observados

- Requiere POST y rechaza otros métodos.
- Usa `Cache-Control: no-store` y `Vary: Authorization`.
- Valida el access token mediante Supabase Auth.
- La clave administrativa se lee desde variables de entorno del servidor.
- Las acciones ordinarias exigen `farmi_active === true` y una cuenta reconocida como administradora.
- Las contraseñas creadas/restablecidas tienen una longitud mínima de 12 caracteres.
- El inventario de usuarios falla si alcanza el límite de paginación.
- Las invitaciones no reflejan el encabezado Origin del cliente.
- La invitación incompleta tiene limpieza compensatoria.
- Las respuestas se construyen mediante `safeUser`, sin incluir tokens ni secretos.

## Pruebas y límites

- Los tests actuales cubren el servicio de estado ERP y el servicio de créditos de proveedor, pero no se encontró una suite de pruebas específica para `api/admin-users.ts`.
- La inspección estática no demuestra que los riesgos se hayan explotado.
- No confirma variables de entorno ni Redirect URLs configuradas en Supabase/Vercel.
- No se probó concurrencia real ni la restauración del volcado SQL.
- No se modificó el endpoint, la base de datos, los usuarios ni la configuración del proyecto.

## Prioridad sugerida

1. Diseñar y probar la operación atómica para bootstrap y protección de última cuenta administradora en un entorno aislado.
2. Configurar y verificar `FARMI_SITE_URL` en cada entorno y sus Redirect URLs.
3. Confirmar el modelo de permisos personalizados frente a permisos acotados por rol.
4. Añadir pruebas automatizadas específicas del endpoint, incluyendo casos concurrentes.

### ADMIN-10 — El token de bootstrap no exige longitud mínima ni limita intentos
**Severidad: media, condicionada a la entropía del secreto configurado. Pendiente.**

La acción `bootstrap` solo comprueba que `FARMI_ADMIN_BOOTSTRAP_TOKEN` no esté vacío y que coincida con el valor recibido. No exige una longitud mínima y el endpoint no implementa un límite de intentos por usuario/IP. La comparación en tiempo constante reduce diferencias temporales, pero no compensa un secreto débil ni limita intentos repetidos.

**Impacto:** mientras no exista un administrador, una persona con una cuenta autenticada podría intentar adivinar un token corto. El impacto depende de la fortaleza real del secreto y de controles externos de tráfico; no se ha probado ni se conoce aquí el valor configurado.

**Recomendación:** exigir en servidor un secreto aleatorio de alta entropía (mínimo 32 bytes aleatorios codificados) y limitar intentos fallidos con un mecanismo compartido entre instancias, con enfriamiento y registro de eventos sin guardar el token. Verificar también si Vercel Firewall u otro control externo ya limita esta ruta. No cambiar el secreto ni las variables de entorno sin coordinar el proceso de bootstrap para no bloquear la administración inicial.

### ADMIN-09 — Valor por defecto permisivo al editar una cuenta
**Estado: corrección aplicada en la rama; pruebas específicas pendientes.**

En `api/admin-users.ts`, la acción `update` ahora calcula el valor por defecto como `target.app_metadata?.farmi_active === true && !target.banned_until`. Si la solicitud envía explícitamente `body.active` como booleano, se conserva ese valor; si omite el campo, una cuenta sin claim activo permanece inactiva.

**Verificación estática:** el código actual de la rama contiene la condición estricta y la pantalla de administración envía `active: next.active` al guardar cambios de rol, permisos o estado. La compilación y las pruebas generales del commit `c0f9e7f9976116d6976907efedf441fb093d7d64` finalizaron correctamente. No hay pruebas específicas del endpoint que cubran claim ausente, falso y verdadero.

**Pendiente:** añadir pruebas unitarias del endpoint y validar las transiciones de activación/desactivación en un entorno aislado. No se modificaron usuarios reales ni datos de Supabase.
