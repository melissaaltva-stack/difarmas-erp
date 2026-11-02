# FARMI / DIFARMAS ERP — hallazgos de rutas de escritura y control de acceso

**Tipo:** revisión estática de código en rama aislada.  
**Estado:** hallazgos verificados en archivos del repositorio; no se ejecutaron pruebas ni llamadas a Supabase.  
**Rama:** `security/erp-state-permission-matrix`.

## Resumen ejecutivo

La autorización visible en la interfaz se aplica principalmente al menú y a la renderización del módulo. El guardado remoto, en cambio, persiste un snapshot JSONB completo por usuario. En el código revisado no se encontró una comprobación central de `farmi_permissions` antes de cada mutación del estado ni una autorización por clave del snapshot en el servicio de persistencia.

Esto significa que la ocultación de módulos no debe considerarse una barrera de seguridad para los datos. La barrera real depende de las políticas RLS y de que el usuario solo pueda modificar su propia fila; esa separación por propietario no equivale a separación por módulo.

## Hallazgos

### WRITE-01 — Autosave de snapshot completo sin autorización por módulo
**Severidad: alta.**

En `src/hooks/useErpState.ts` se construye un `snapshot` con colecciones operativas, financieras, de usuarios/configuración e inventario. Un efecto programa `saveErpSnapshot(userId, snapshot)` cuando cambia el estado. El servicio `src/services/remoteErpState.ts` actualiza `erp_state.state` completo mediante `.update({ state: snapshot, updated_at })`.

El servicio recibe `userId` y snapshot, pero no recibe ni verifica permisos por módulo. La policy RLS conocida limita al propietario/rol general, no compara las claves JSONB modificadas.

**Impacto:** un usuario con permiso general de escritura sobre su fila podría alterar claves que no corresponden a sus módulos, si puede provocar o enviar una actualización equivalente por cliente/API. Ocultar el módulo en React no impide una petición directa.

**Recomendación:** no conectar el snapshot completo a nuevos controles de permisos como si fueran autorización. Migrar las escrituras sensibles a RPCs/servicios de servidor con autorización por operación y validación de estado; normalizar tablas sensibles gradualmente.

### WRITE-02 — Mutaciones de datos se exponen como setters y funciones del cliente
**Severidad: alta.**

En `src/App.tsx` se pasan setters directos a componentes, incluidos `setReceivables`, `setPayables`, `setPaymentTransactions`, `setMissingProductRequests`, `setExpenses`, `setSettings`, `setCustomers` y `setSuppliers`. El hook contiene además operaciones cliente como `saveProduct`, `deleteProduct`, `recordSale`, `receivePurchase`, `recordSaleAdjustment` y `resolveSupplierReturn`.

Estas funciones organizan la UI y la lógica del navegador, pero no son una frontera de seguridad frente a un cliente modificado o una petición directa.

**Recomendación:** sustituir setters de colecciones sensibles por comandos de dominio validados en servidor. Mantener setters locales solo como estado de presentación, sin concederles autoridad sobre persistencia.

### WRITE-03 — Autorización de módulo es principalmente navegación/renderizado
**Severidad: alta.**

En `src/App.tsx`, `canSee` consulta los permisos del JWT y `activeAllowed` decide si se renderiza el módulo activo. Los submenús filtran algunas opciones. No obstante, el componente raíz sigue pasando a módulos los datos y callbacks del hook, y el autosave opera independientemente de qué módulo está visible.

**Impacto:** un usuario puede no ver una pantalla y aun así la sesión cliente mantiene referencias a datos/setters; la UI no impide por sí sola que se invoquen funciones o se construya una petición alternativa.

**Recomendación:** mantener la UI como experiencia de usuario, no como control de autorización. Cada operación debe volver a validar rol, permiso específico, propiedad y reglas de negocio en el servidor/DB.

### WRITE-04 — Ausencia de rol produce permisos de fallback en la interfaz
**Severidad: media-alta; requiere decisión de compatibilidad.**

En `src/App.tsx`, cuando no se obtiene un rol válido, se usa `['dashboard','configuracion']` como permisos de interfaz. Además, `active` se calcula con `userAppMetadata.farmi_active !== false`, de modo que la ausencia del claim se interpreta como activo. La migración RLS previamente revisada también usa un valor por defecto activo si el claim falta.

**Impacto:** metadata incompleta no falla cerrada de forma consistente. El fallback visual no concede por sí mismo acceso a Supabase, pero crea una discrepancia que puede confundir y debe alinearse con la política real.

**Recomendación:** inventariar usuarios/claims existentes antes de cambiar el comportamiento. Después, definir una migración explícita para estados incompletos, bloquear acceso hasta corregir metadata y probar sesiones antiguas.

### WRITE-05 — Borrado físico de productos
**Severidad: media-alta.**

En `src/hooks/useErpState.ts`, `deleteProduct(id)` elimina el producto del arreglo `products`. Como ventas, compras y movimientos históricos guardan referencias/campos derivados del producto, el borrado puede debilitar la trazabilidad o romper relaciones de UI.

**Recomendación:** implementar archivado/inactivación, preservar el identificador y los datos históricos, y evitar borrado físico salvo proceso administrativo con validación de dependencias.

### WRITE-06 — Finanzas y cuentas por cobrar/pagar comparten mutaciones del snapshot
**Severidad: alta.**

Los componentes de Finanzas, Cuentas por cobrar y Cuentas por pagar reciben setters para colecciones completas. El estado compartido incluye `receivables`, `payables`, `paymentTransactions`, `cashMovements`, `cashClosures` y `expenses`. El historial de cobros y pagos también se guarda dentro del mismo snapshot.

**Impacto:** un permiso de UI o policy que autorice una clave completa no separa operaciones como registrar un cobro, editar un saldo, alterar un pago a proveedor o reescribir el historial.

**Recomendación:** operaciones RPC separadas para cobrar, pagar, revertir, ajustar y cerrar caja; idempotencia, bloqueos transaccionales y movimientos inmutables. No dar UPDATE directo sobre colecciones completas.

## Flujo de persistencia revisado

1. El hook mantiene cada colección en estado React y también guarda copias locales.
2. Construye un único objeto `ErpSnapshot` con todas las colecciones.
3. Tras los cambios, el autosave invoca `saveErpSnapshot(userId, snapshot)`.
4. El servicio usa INSERT inicial si no existe revisión remota; en caso contrario hace UPDATE de la columna JSONB completa con control optimista por `updated_at`.
5. Existe una ruta especial para cotizaciones que lee la última revisión y actualiza la clave `quotes`, pero no constituye una autorización de módulo.

El control de revisión reduce algunas colisiones; no valida quién puede cambiar cada dato ni garantiza integridad de negocio.

## Archivos revisados

- `src/hooks/useErpState.ts`
- `src/services/remoteErpState.ts`
- `src/App.tsx`
- `api/admin-users.ts`

## Acciones recomendadas, ordenadas por seguridad

1. **No desplegar esta rama como endurecimiento de permisos todavía.** La documentación y helpers no sustituyen autorización en backend.
2. Obtener y revisar el inventario real de políticas, grants, funciones, triggers y vistas en staging.
3. Definir una matriz operación → rol/permisos → tablas/filas afectadas.
4. Implementar primero RPCs transaccionales para cobros/pagos, ventas y recepción de compras.
5. Separar catálogo/precios, lotes/stock, movimientos e historial de costos.
6. Sustituir setters de colecciones financieras por comandos de dominio.
7. Introducir archivado de productos y conservar las referencias históricas.
8. Migrar datos existentes con copia, validación, reconciliación y plan de reversión.

**Límites:** este informe es una inspección estática de la rama indicada. No demuestra explotación, no confirma el estado de Supabase y no reemplaza pruebas con JWT de usuarios ficticios en staging.
