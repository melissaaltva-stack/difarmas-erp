# DIFARMÁS — Tienda en línea (prototipo)

Esta carpeta es una aplicación independiente del ERP existente y se prepara para vista previa en Vercel configurando el directorio raíz del proyecto como `tienda`.

## Ejecutar

```bash
npm install
npm run dev
npm run build
```

## Importante antes de producción

- Los productos y precios actuales son datos de demostración derivados de valores iniciales; validar precios, disponibilidad e imágenes con DIFARMÁS antes de publicarlos.
- El catálogo de este prototipo no consulta el ERP ni Supabase y no reserva inventario.
- El carrito arma un mensaje para WhatsApp; el cliente debe confirmar disponibilidad y precio.
- Para sincronizar inventario, crear un catálogo público separado con RLS y una operación de pedido segura. No exponer la tabla privada `erp_state`, claves `service_role`, costos, ventas ni datos de clientes.
- No incluir medicamentos que requieran receta en un flujo de venta directa sin revisar la normativa hondureña aplicable.
