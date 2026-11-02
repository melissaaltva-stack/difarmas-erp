# Auditoría de seguridad — catálogo público DIFARMÁS

Rama: `security/erp-state-permission-matrix`  
Revisión estática de `api/store-catalog.ts` y `src/domain/types.ts`. No se ejecutó ni desplegó código.

## Hallazgo STORE-01 — El endpoint publica productos sin una marca explícita de publicación

**Severidad: alta si el snapshot contiene productos internos/no aprobados.**

El filtro actual de `publicProduct` descarta un producto solo cuando `product.active === false`. Sin embargo, el tipo `Product` en `src/domain/types.ts` no declara `active`, `isPublished` ni `is_published`. Por tanto, en el modelo actual un producto normal no tiene que declarar un estado activo para pasar ese filtro.

El endpoint lee `state.products` completo desde la fila de `erp_state` seleccionada por `FARMI_STORE_CATALOG_USER_ID` y devuelve los registros que superan la validación de nombre, identificador y precio. No se observa un filtro de publicación explícita.

**Impacto potencial:** un producto que exista en el inventario ERP podría aparecer en el catálogo público aunque el administrador no lo haya seleccionado para la tienda. No se exponen directamente costo, stock, lote, vencimiento ni proveedor, lo cual es un control positivo, pero no resuelve la publicación involuntaria.

**Corrección recomendada:** agregar un campo de publicación explícito y persistente al modelo de producto, por ejemplo `storePublished: boolean`, y publicar únicamente cuando su valor sea exactamente `true`. La migración del comportamiento debe iniciar en modo seguro: los productos existentes quedarían no publicados hasta que el administrador los seleccione, por lo que primero se necesita una pantalla/flujo de selección y confirmación. No aplicar ese cambio sin autorización porque cambiaría el catálogo visible.

## Hallazgo STORE-02 — El endpoint usa credenciales privilegiadas para leer un snapshot completo

**Severidad: media; diseño deliberado con impacto alto si se configura mal.**

El endpoint usa una clave de servidor con privilegios elevados y lee `state` completo, aunque solo devuelve una proyección limitada de productos. La clave no aparece enviada al navegador en este archivo, lo cual es positivo. El control depende de que las variables privilegiadas estén configuradas exclusivamente en el entorno server-side y de que `FARMI_STORE_CATALOG_USER_ID` apunte a la cuenta correcta.

**Recomendaciones:**
- Mantener la clave privilegiada solo en variables server-side, nunca con prefijo `VITE_`.
- No registrar el snapshot ni la clave en logs.
- Validar que el ID configurado corresponda a la cuenta propietaria del catálogo autorizado.
- Preferir en el futuro una tabla/vista de catálogo publicada separada del snapshot ERP, con campos mínimos y RLS/lectura pública explícita.

## Hallazgo STORE-03 — El endpoint acepta claves privilegiadas alternativas

El código prueba `SUPABASE_SERVICE_ROLE_KEY` y `SUPABASE_SECRET_KEY` en secuencia. Esto permite compatibilidad con distintos tipos de claves, pero conviene documentar cuál se espera en producción y evitar que una variable antigua o equivocada sea usada silenciosamente como alternativa.

## Controles positivos observados

- Solo acepta GET; otros métodos reciben 405.
- Envía `Cache-Control: no-store`, `X-Content-Type-Options: nosniff` y `Vary: Accept`.
- La respuesta construye una proyección limitada; no devuelve el objeto de producto completo.
- La imagen solo acepta URL HTTPS.
- El endpoint no devuelve costo, stock, lote, vencimiento, proveedor ni snapshot completo.
- Si falta configuración, devuelve 503 sin productos.

## Pendientes de validación

- Confirmar variables configuradas en Vercel sin revelar valores secretos.
- Confirmar que el ID configurado es la cuenta correcta.
- Probar en staging un producto no publicado y otro explícitamente publicado.
- Confirmar que la tienda solo muestra el conjunto que el administrador decidió publicar.
- Revisar límites de respuesta/paginación si el catálogo crece.

**Conclusión:** no cambiar todavía el filtro en producción. El hallazgo debe resolverse con un campo de publicación explícito y un proceso de selección de productos, preservando los datos del ERP y evitando que una migración oculte inesperadamente todo el catálogo.
