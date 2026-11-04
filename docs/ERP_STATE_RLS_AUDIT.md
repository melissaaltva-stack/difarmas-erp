# Auditoría estática de RLS y sincronización de FARMI

**Rama:** `security/erp-state-permission-matrix`  
**Alcance:** revisión estática de la migración RLS, `App.tsx`, `useErpState.ts` y `remoteErpState.ts`.  
**Estado:** análisis documental; no se ejecutaron SQL, pruebas PostgreSQL, migraciones ni despliegues.

## Resumen ejecutivo

La política actual de `erp_state` protege la propiedad de la fila y bloquea escrituras para `Solo lectura` y roles desconocidos, pero **no aplica permisos por módulo ni por campo**. Cualquier usuario autenticado con uno de los cinco roles de escritura puede intentar reemplazar el objeto JSONB completo de su propia fila. La navegación de React no constituye una frontera de seguridad.

No se recomienda conectar esta política como autorización definitiva por módulo ni aplicar una migración correctiva hasta diseñar y probar la transición desde snapshots existentes.

## Hallazgos

### RLS-01 — Autorización por rol, no por permiso individual
**Severidad: crítica para el modelo de permisos por módulo.**

Las políticas INSERT y UPDATE aceptan los roles Administrador, Supervisor, Ventas, Compras y Finanzas. No comparan `farmi_permissions`, ni inspeccionan qué claves del JSONB cambiaron. Un usuario Ventas puede enviar una actualización directa que cambie productos, costos, proveedores, compras, gastos, saldos, movimientos o configuración, aunque la interfaz no muestre esos módulos.

La política protege que el usuario solo escriba su propio `user_id`; no protege la separación funcional dentro de `state`.

**Recomendación:** no intentar resolver operaciones financieras/inventario con una lista simple de claves JSONB. Separar operaciones sensibles en RPC transaccionales y/o tablas normalizadas con RLS por fila. Mientras exista el snapshot monolítico, cualquier escritura autorizada debe considerarse capacidad de reemplazar todo el snapshot.

### RLS-02 — `farmi_active` ausente se interpreta como activo
**Severidad: alta.**

La expresión `coalesce((...farmi_active)::boolean, true)` permite acceso si el claim falta o es NULL. Además, un valor de texto no convertible a booleano puede provocar error al evaluar la política, en vez de una denegación controlada.

**Recomendación:** definir un contrato estricto de metadata y migración. Después de inventariar todas las cuentas y claims existentes, exigir explícitamente `farmi_active = true`; valores ausentes, nulos o inválidos deben denegarse. No cambiar el default antes de conocer el estado real de todas las cuentas, porque podría bloquear usuarios legítimos.

### RLS-03 — La política no valida permisos de módulo ni claims completos
**Severidad: alta.**

El claim `farmi_permissions` es leído por el frontend, pero no participa en las políticas. La lista de permisos guardada en `settings.users` es configuración de interfaz y no autoridad. Un usuario puede manipular el cliente; la autorización debe ocurrir en servidor/base de datos.

**Recomendación:** usar metadata firmada solo como fuente de identidad/rol confiable, pero aplicar operaciones concretas en servidor. No aceptar arrays de permisos enviados por el navegador como prueba de autorización.

### APP-01 — La interfaz oculta navegación, no protege escrituras
**Severidad: alta.**

`App.tsx` calcula `canSee` desde los claims del token y condiciona el módulo activo. Esto es útil para UX, pero no impide invocar Supabase directamente ni garantiza que todos los setters pasados a los componentes respeten permisos. El guardado automático persiste el snapshot completo.

**Recomendación:** mantener los controles visuales, pero trasladar la autorización a operaciones de servidor/RPC y tablas con RLS. Revisar cada setter expuesto y eliminar escrituras genéricas donde sea posible.

### SYNC-01 — La carga inicial puede crear el snapshot remoto desde datos locales
**Severidad: alta para integridad y separación de cuentas.**

Si `loadErpSnapshot` no encuentra una fila, `useErpState` habilita el guardado y el primer guardado intenta INSERT del snapshot local completo. El INSERT-only evita sobrescribir una fila creada concurrentemente, pero no demuestra que el contenido local pertenezca a esa cuenta ni que esté autorizado para importarse.

El código intenta evitar reutilizar la caché al detectar cambio de propietario, pero el flujo sigue mezclando inicialización local y creación remota.

**Recomendación:** separar explícitamente cuenta nueva sin datos e importación de datos locales. La importación debe ser una acción autenticada, única, con validación profunda de estructura, propietario y claves permitidas; ante contenido inesperado debe detenerse sin descartar datos. No crear automáticamente una fila vacía al invitar, pues puede bloquear una importación legítima posterior.

### SYNC-02 — Comparación de revisión protege frente a sobrescritura concurrente, no frente a permisos
**Severidad: media.**

El uso de `updated_at` como revisión y el UPDATE condicionado por la revisión observada ayudan a detectar cambios concurrentes entre sesiones. La cola local serializa guardados en esta pestaña. Esto no valida qué campos puede modificar el usuario ni hace atómicas las operaciones de negocio que se realizan en el navegador.

**Recomendación:** conservar la protección optimista durante la transición, pero no tratarla como control de autorización o integridad transaccional.

### SYNC-03 — Validación del snapshot es superficial
**Severidad: media.**

`normalizeSnapshot` verifica que algunas propiedades sean arreglos y que dos valores numéricos sean finitos. No valida el esquema interno de productos, ventas, compras, movimientos, cuentas, relaciones, importes, estados ni claves desconocidas. También completa claves faltantes con arreglos vacíos/valores por defecto.

**Recomendación:** definir validación versionada y no destructiva. Distinguir campos opcionales históricos de campos obligatorios, preservar campos desconocidos durante migraciones compatibles y detener importaciones inválidas sin reemplazar el estado remoto.

### ADMIN-01 — Cambios de metadata pueden no reflejarse inmediatamente en JWT ya emitidos
**Severidad: media.**

`api/admin-users.ts` modifica `app_metadata` usando el cliente administrativo. Los claims incluidos en un JWT ya emitido pueden permanecer obsoletos hasta que el usuario renueve la sesión. La política RLS evalúa los claims del JWT presentado.

**Recomendación:** definir revocación/renovación de sesión al desactivar o cambiar permisos y probar el comportamiento con tokens anteriores y nuevos. No asumir que actualizar metadata invalida automáticamente todos los JWT existentes.

### ADMIN-02 — Invitación y asignación de permisos son dos operaciones
**Severidad: media.**

El endpoint invita al usuario y después actualiza su metadata. Si la segunda operación falla, la invitación ya fue creada; el endpoint devuelve error y advierte que debe revisarse la cuenta.

**Recomendación:** mantener el estado parcial explícito y agregar reconciliación administrativa/reintento seguro. No marcar como lista una cuenta cuya metadata no se confirmó.

## Límites de esta revisión

- No se inspeccionó una instancia PostgreSQL/Supabase conectada ni se consultaron políticas efectivas del proyecto.
- No se verificaron grants de tabla, políticas anteriores aplicadas en producción, triggers, funciones SECURITY DEFINER ni configuración de Auth del proyecto.
- La migración revisada solo muestra las tres políticas nombradas que reemplaza; otras políticas permisivas existentes podrían combinarse con ellas bajo RLS.
- No se verificó si el archivo de migración está aplicado en ningún entorno.
- No se ejecutaron tests, build ni despliegue.

## Plan de pruebas PostgreSQL aislado

Ejecutar únicamente en una base de pruebas desechable, con usuarios y datos ficticios. Nunca usar la base de producción para estas pruebas.

| ID | Preparación / acción | Resultado esperado |
|---|---|---|
| T01 | Usuario autenticado intenta SELECT su propia fila con `farmi_active=true` | Permitido |
| T02 | Usuario intenta SELECT fila de otro usuario | Cero filas |
| T03 | Usuario activo con rol Administrador | INSERT/UPDATE propios según política vigente |
| T04 | Usuario activo con rol Supervisor | INSERT/UPDATE propios según política vigente |
| T05 | Usuario activo con rol Ventas | La política actual permite INSERT/UPDATE propios; documentar que puede cambiar cualquier clave del snapshot |
| T06 | Usuario activo con rol Compras | Igual que T05 |
| T07 | Usuario activo con rol Finanzas | Igual que T05 |
| T08 | Rol Solo lectura | SELECT propio permitido; INSERT/UPDATE denegados |
| T09 | Rol ausente o desconocido | SELECT sujeto a activo; INSERT/UPDATE denegados |
| T10 | `farmi_active=false` | SELECT/INSERT/UPDATE denegados |
| T11 | Claim `farmi_active` ausente o NULL | Reproducir y confirmar que la política actual lo trata como activo |
| T12 | Claim `farmi_active` con texto inválido | Confirmar si la evaluación genera error de conversión |
| T13 | Cualquier rol escribe `user_id` de otra persona | Denegado |
| T14 | Intento DELETE de fila propia | Denegado si no existe otra política/grant que lo permita |
| T15 | Dos sesiones actualizan con mismo `updated_at` | Solo una actualización condicional debe confirmar |
| T16 | Token anterior tras desactivar/cambiar rol en Auth | Medir si sigue autorizado hasta renovación/expiración |
| T17 | INSERT inicial con claves desconocidas o estructuras inválidas | Actualmente RLS no valida el contenido; la aplicación debe rechazarlo antes de habilitar importación |
| T18 | Revisar `pg_policies`, grants, triggers y funciones privilegiadas | Inventario completo; identificar políticas permisivas adicionales y rutas de bypass |

## Próxima secuencia segura

1. Inventariar todas las políticas, grants, triggers y funciones de `erp_state` en un entorno de pruebas o mediante exportación SQL de solo lectura.
2. Obtener inventario de cuentas y claims sin modificar usuarios.
3. Definir el mecanismo de importación inicial separado del guardado normal.
4. Diseñar RPCs transaccionales para ventas, compras, inventario, cobros, pagos, devoluciones y ajustes.
5. Escribir y ejecutar pruebas PostgreSQL/RLS aisladas.
6. Solo después preparar una migración de transición con respaldo, compatibilidad y plan de reversión.

**No aplicar esta auditoría como migración.** Este documento no cambia políticas, datos ni comportamiento del ERP.


## Revalidación del catálogo activo — 2026-11-03

Consultas SELECT al catálogo del proyecto Supabase conectado confirman que las tres policies de `public.erp_state` siguen usando `COALESCE(farmi_active::boolean, true)`; INSERT/UPDATE siguen limitados a roles generales, sin comprobar `farmi_permissions` ni qué claves del JSONB se modifican. El hallazgo RLS-01/RLS-02 queda confirmado en la base consultada, no solo en el SQL versionado.

El inventario adicional confirma que `store_products` tiene RLS y una policy de lectura pública para productos publicados. No hay policies de escritura para `anon` o `authenticated`, aunque ambos roles tienen grants SQL INSERT/UPDATE/DELETE. RLS bloquea esas operaciones actualmente; los grants son innecesarios y se recomienda revocarlos en un cambio independiente, tras comprobar la ruta de administración de catálogo.

No se encontraron funciones en `public`, triggers para estas dos tablas ni vistas en `public`. `anon` y `authenticated` no tienen atributo `BYPASSRLS`; `service_role` y `postgres` sí. Las tablas son propiedad de `postgres` y no tienen FORCE RLS.

**Acciones ejecutadas:** únicamente consultas de lectura. No se modificaron políticas, grants, tablas, filas, usuarios, funciones, Auth ni configuración. No se realizaron pruebas de escritura.

**Estado:** RLS-01 y RLS-02 confirmados en la base activa; nuevo hallazgo RLS-03 de grants DML innecesarios en `store_products`; no se ha aplicado corrección en Supabase.
