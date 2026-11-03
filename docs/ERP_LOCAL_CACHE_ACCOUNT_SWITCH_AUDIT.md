# Auditoría de caché local y cambio de cuenta

Fecha: 2026-11-02  
Rama: `security/erp-state-permission-matrix`

## Hallazgo

Los estados iniciales de FARMI se hidrataban desde claves globales de `localStorage` antes de que terminara el efecto que detecta el cambio de usuario. En un navegador compartido, esto podía hacer que el primer render del usuario nuevo contuviera temporalmente valores de la cuenta anterior, antes de que el efecto limpiara y cargara el snapshot remoto.

Además, los efectos de persistencia local escribían los estados iniciales inmediatamente, incluso mientras el snapshot de Supabase todavía estaba cargando o si la lectura remota terminaba en error.

## Correcciones

1. Los inicializadores ahora consultan `difarmas_owner_user_id`. Si existe un propietario distinto del usuario actual, no hidratan valores desde la caché anterior.
2. Los efectos de escritura a `localStorage` esperan a que `remoteReady` sea verdadero. Una lectura remota fallida ya no sobrescribe la caché local con estados iniciales.
3. Las escrituras de caché se ejecutan después de que el snapshot remoto del usuario haya sido cargado correctamente.

## Limitaciones pendientes

- Si `difarmas_owner_user_id` no existe (caché heredada), se conserva la compatibilidad y se permite la lectura local. Para una migración estricta de cuentas antiguas se necesita un procedimiento explícito de adopción de caché, porque bloquearla sin transición podría descartar datos locales históricos que aún no se hayan sincronizado.
- `localStorage` sigue siendo almacenamiento del navegador, no una frontera de seguridad. No debe contener secretos ni sustituir las políticas RLS.
- La protección real entre usuarios sigue dependiendo de Supabase Auth y RLS. El snapshot `erp_state` continúa siendo una fila completa por usuario.

## Verificación

Cambios de código en commits:
- `b558118d67bd241f201be1330a900aa550642daa`: evita hidratar la primera renderización desde la caché de otro usuario.
- `b82938d082aa8f4440340b58e9844dce10c5bd2f`: difiere las escrituras locales hasta que termina la carga remota.

El estado de Vercel para el commit más reciente estaba pendiente al redactar este informe. No se afirma que la compilación haya pasado hasta que el proveedor confirme el resultado.

No se modificó Supabase, no se ejecutaron migraciones ni se tocaron datos reales. No se fusionó ni desplegó a producción.

## Revalidación — 2026-11-03

Se releyó el flujo actual de `useErpState.ts`, `remoteErpState.ts`, `storage.ts` y `AuthGate.tsx`.

- Se confirma que el cambio de cuenta bloquea la hidratación desde una caché cuyo propietario registrado sea otro usuario.
- Se confirma que las escrituras locales y el autosave remoto esperan a que la lectura remota termine correctamente.
- Se confirma que un error de lectura mantiene `remoteReady=false`, por lo que no se habilita el autosave que podría reemplazar el snapshot.
- La carga heredada sin `difarmas_owner_user_id` todavía admite caché local. No se cambió porque bloquearla sin un flujo de importación/respaldo podría dejar datos históricos sin recuperar.
- El cierre de sesión no elimina la caché. Tampoco se implementó borrado automático: no existe una confirmación fiable de que no haya operaciones pendientes de sincronización.
- Las claves gerenciales `difarmas_exec_actions`, `difarmas_management_tasks`, `difarmas_audit_history`, `difarmas_campaigns` y `difarmas_price_history` siguen siendo locales y no están separadas por usuario. No deben considerarse datos privados ni bitácora formal.

### Validación automatizada

El commit `4f54cd385d717171c06f3abda72cb927250146c9` pasó GitHub Actions:
- instalación de dependencias;
- auditoría npm;
- compilación TypeScript/Vite;
- pruebas automatizadas.

Ejecución: https://github.com/melissaaltva-stack/difarmas-erp/actions/runs/41741411041

No existe despliegue Vercel asociado a ese commit. Esta revalidación es estática y automatizada; no representa una prueba de dos cuentas en un navegador real. No se modificó Supabase ni se borró almacenamiento local.
