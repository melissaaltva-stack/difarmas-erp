# Tienda en línea DIFARMÁS — plan de integración segura

## Estado de esta rama
Esta rama añade una primera maqueta navegable en `public/tienda/index.html`. La maqueta utiliza datos y precios ficticios, y conserva los pedidos de demostración únicamente en el almacenamiento local del navegador. No es apta para procesar compras reales.

## Arquitectura existente revisada
- Aplicación ERP: React + TypeScript + Vite.
- Persistencia actual: una fila privada `public.erp_state` con una instantánea JSON por usuario autenticado.
- Seguridad actual: RLS restringe la instantánea al usuario autenticado. No se debe dar acceso anónimo a `erp_state`.
- Publicación: GitHub Pages a través de `.github/workflows/deploy-pages.yml`; Vite copia los archivos de `public/` a `dist/`.
- El ERP contiene productos, precios y existencias en su estado operativo; todavía no existe un catálogo público independiente con autorización explícita de publicación ni una tabla de pedidos de tienda.

## Fases propuestas
1. **Prototipo visual aislado:** catálogo ficticio, búsqueda, categorías, carrito, formulario, enlace a WhatsApp y panel de pedidos de demostración.
2. **Revisión de datos y permisos:** definir quién puede publicar un producto, precio minorista, disponibilidad, imagen y categoría. No exponer costo, precio mayorista, proveedores, lotes, vencimientos, clientes ni otros campos privados.
3. **Migración aditiva de Supabase:** crear tablas separadas para catálogo publicado y pedidos. Añadir políticas RLS específicas; los visitantes solo podrán leer productos publicados y crear pedidos con validación. Los datos administrativos solo serán accesibles a cuentas autorizadas. No modificar ni migrar automáticamente `erp_state`.
4. **Integración controlada:** una función del lado servidor o proceso administrativo sincronizará campos permitidos desde el ERP al catálogo público. El pedido entrante no será una venta confirmada ni descontará inventario hasta la aceptación del personal.
5. **Pruebas en entorno separado:** probar RLS con sesión anónima y sesión administrativa, límites de cantidad/precio, pedidos duplicados, validación de entrada y rutas móviles. Probar con productos ficticios.
6. **Vista previa gratuita:** publicar la rama de prueba en una URL de preview independiente antes de fusionar a `main`. No cambiar el despliegue actual del ERP durante esta fase.
7. **Lanzamiento gradual:** activar datos reales solo después de validar políticas, permisos, catálogo, flujo de pedidos y proceso de entrega.

## Reglas de seguridad
- Nunca incluir claves `service_role` en el navegador ni en el repositorio.
- No conceder acceso público a `erp_state`.
- El navegador no determina precios finales ni disponibilidad autoritativa.
- Validar en servidor cada artículo, cantidad, precio y total del pedido.
- Los pedidos web no deben cambiar el inventario ni crear ventas automáticamente antes de confirmación.
- No solicitar ni guardar datos de tarjeta en esta maqueta.
- Los productos sujetos a receta o a controles especiales deben requerir el proceso de validación adecuado.
- No introducir datos reales de clientes en el modo demostración.

## Cómo probar esta maqueta
Al abrir la página, se puede buscar, filtrar, añadir productos al carrito, completar un pedido ficticio, abrir WhatsApp con un mensaje de demostración y revisar el panel de pedidos. El panel usa almacenamiento local del navegador y no tiene autenticación: nunca debe usarse como panel administrativo de producción.
