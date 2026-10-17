# Configurar Supabase para DIFARMÁS ERP

Esta fase agrega autenticación y sincronización centralizada para el MVP. El navegador usa solamente la clave **publishable**; nunca se debe usar una clave `service_role` o una clave secreta en el frontend.

## 1. Crear o elegir el proyecto Supabase

1. Abre el proyecto Supabase que usará DIFARMÁS.
2. En **Project Settings → API**, copia el **Project URL** y la **publishable key**.
3. En **Authentication → Providers**, habilita Email.
4. Desactiva el registro público si no quieres que cualquiera pueda crear cuentas. Crea las cuentas autorizadas desde el panel de Supabase.

## 2. Crear la tabla privada

Abre **SQL Editor** en Supabase y ejecuta el contenido de:

`supabase/migrations/202610170001_erp_state.sql`

La tabla tiene Row Level Security (RLS): cada sesión autenticada solo puede leer o modificar la fila cuyo `user_id` coincide con su propio `auth.uid()`. Los usuarios anónimos no reciben permisos y el navegador no puede borrar la fila.

## 3. Configurar variables

Crea un archivo `.env.local` para desarrollo local usando `.env.example` como plantilla. Completa:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

Para el despliegue actual en GitHub Pages, abre **Settings → Secrets and variables → Actions** en el repositorio y crea estos repository secrets: `VITE_SUPABASE_URL` y `VITE_SUPABASE_PUBLISHABLE_KEY`. El workflow de GitHub Pages valida que ambos existan y los incorpora durante la compilación. Después de cambiar los secrets, vuelve a ejecutar el workflow **Deploy DIFARMÁS ERP to GitHub Pages**.

No publiques `.env.local` ni compartas contraseñas. No agregues variables `service_role` al frontend.

## 4. Crear el usuario autorizado

En Supabase abre **Authentication → Users** y crea/invita el correo que utilizarás para el ERP. Si el proyecto exige confirmación de correo, completa esa verificación antes de entrar.

La pantalla de acceso del ERP no tiene opción de registro público.

## 5. Primer inicio y migración de datos locales

1. Haz una copia de seguridad/exportación de los datos locales que necesites conservar antes de cambiar de equipo o borrar datos del navegador.
2. Abre el ERP y entra con el correo autorizado.
3. Si esa cuenta todavía no tiene una fila en `erp_state`, el ERP subirá el estado local del navegador que se usó en el primer inicio de sesión. Si ya existe una fila remota, esa versión será la fuente principal y reemplazará el estado cargado localmente.
4. Comprueba productos, ventas, compras, gastos, cuentas por cobrar/pagar y movimientos antes de operar.

Para que computadora y celular vean los mismos datos, entra con la misma cuenta autorizada en ambos dispositivos.

## Alcance y limitaciones de esta primera fase

- El MVP guarda una instantánea JSON por cuenta, protegida por RLS. Es una etapa puente para centralizar el estado actual sin reescribir todos los módulos.
- Las escrituras usan control optimista de versiones: si otra sesión cambia el estado después de la última lectura, el guardado se rechaza con un aviso para recargar en lugar de sobrescribir silenciosamente los datos. Aun así, no hay sincronización en tiempo real; coordina las ediciones simultáneas y verifica los datos después de un conflicto.
- Esta fase no crea roles de empleados ni un espacio de trabajo compartido entre distintas cuentas. Para varios usuarios, el siguiente paso debe ser un modelo de empresa/equipo con membresías y permisos por rol.
- Las claves de configuración del frontend no sustituyen RLS. No uses datos reales hasta haber ejecutado la migración y probado el acceso con una cuenta autorizada.
