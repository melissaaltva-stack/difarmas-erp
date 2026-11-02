# Auditoría de almacenamiento local y aislamiento entre cuentas — FARMI

Rama: `security/erp-state-permission-matrix`  
Archivo revisado: `src/components/ManagementSuite.tsx` y flujo de cierre de sesión en `src/components/AuthGate.tsx`.  
Revisión estática; no se inspeccionó el navegador ni los datos reales de usuarios.

## LOCAL-01 — Datos gerenciales guardados en localStorage compartido por navegador

**Severidad: media; confidencialidad e integridad operativa.**

El módulo utiliza claves globales de navegador, entre ellas:
- `difarmas_exec_actions`
- `difarmas_management_tasks`
- `difarmas_audit_history`
- `difarmas_campaigns`
- `difarmas_price_history`

No se observa que estas claves estén asociadas al identificador del usuario autenticado. El cierre de sesión de `AuthGate` llama a Supabase `signOut()`, pero no limpia ni separa estos registros locales.

**Impacto:** en una computadora compartida, una cuenta posterior podría ver tareas, historial local, campañas o cambios de precio guardados por una cuenta anterior. Los registros también pueden divergir entre equipos y no forman parte del respaldo remoto del ERP.

**Recomendación:** decidir qué información es compartida por toda DIFARMÁS y cuál es privada por usuario. Para información compartida, persistirla en el backend con autorización adecuada; para información privada, separar por ID autenticado y limpiar la vista/estado al cerrar sesión. No borrar automáticamente las claves actuales antes de migrar o respaldar su contenido.

## LOCAL-02 — Lectura JSON sin manejo de errores en dos componentes

**Severidad: baja/media; disponibilidad.**

`CampaignAnalytics` y la inicialización de estado de `CampaignTracking` ejecutan `JSON.parse(localStorage.getItem('difarmas_campaigns') || '[]')` sin `try/catch`. Si el contenido local queda truncado o malformado, el componente puede fallar al renderizar.

También se observan otras áreas que sí protegen el parseo con `try/catch`, por lo que el manejo es inconsistente.

**Recomendación:** centralizar lectura/escritura local con parseo defensivo y validación de esquema; ante datos inválidos, conservar una copia para recuperación y mostrar estado recuperable, no sobrescribir silenciosamente.

## LOCAL-03 — Los registros locales no son un libro de auditoría confiable

**Severidad: media para trazabilidad.**

El historial denominado `difarmas_audit_history` se guarda únicamente en localStorage y permite registrar una señal calculada en el navegador. No se observa envío a un registro servidor inmutable ni identidad del actor autenticado.

**Impacto:** los registros pueden editarse o eliminarse desde el navegador y no permiten demostrar quién realizó una acción. No debe usarse como evidencia formal de auditoría o control interno.

**Recomendación:** mantenerlo identificado como bitácora local auxiliar. Para auditoría formal, registrar eventos desde operaciones de servidor con actor, fecha, entidad, acción, resultado e identificador de correlación; impedir edición/borrado ordinario y definir retención.

## Controles positivos observados

- React presenta los valores como texto; en las líneas revisadas no se encontró `dangerouslySetInnerHTML` ni asignación directa de `innerHTML`.
- Las tareas y campañas usan almacenamiento separado por nombre de clave, lo cual evita colisiones accidentales entre módulos, aunque no aísla cuentas.
- Varias inicializaciones de localStorage ya usan `try/catch`.

## Acciones recomendadas antes de cambiar el código

1. Clasificar cada clave local como dato compartido, privado o temporal.
2. Respaldar los valores existentes antes de migrar.
3. Confirmar si equipos de caja son compartidos y qué información puede ver cada rol.
4. Migrar la bitácora formal a un registro de servidor antes de presentarla como auditoría.
5. Añadir pruebas con dos cuentas en el mismo navegador y con JSON local malformado.

**No se modificó código, almacenamiento del navegador, datos del ERP ni configuración de Supabase.**
