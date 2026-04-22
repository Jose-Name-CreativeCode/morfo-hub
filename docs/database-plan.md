# Plan de datos inicial

Este plan alinea la base de datos con la arquitectura funcional definida en
[modules.md](/Users/jose/Downloads/morfo-hub/docs/modules.md).

## Entidades principales

- `Cliente`: datos generales del cliente y su perfil.
- `DireccionEnvio`: direcciones asociadas a cada cliente.
- `Empleado`: usuarios internos del sistema.
- `Rol` y `Permiso`: base para seguridad RBAC.
- `Producto` y `CategoriaProducto`: catalogo de venta.
- `Inventario`: existencia y disponibilidad por producto.
- `Pedido` y `DetallePedido`: compra y sus lineas.
- `Factura`: comprobante generado desde un pedido.
- `Pago`: transacciones y confirmaciones.
- `Envio`: datos logisticos y seguimiento.
- `Proveedor` y `CompraProveedor`: abastecimiento.

## Relaciones clave

- Un `Cliente` puede tener muchas `DireccionEnvio`.
- Un `Empleado` puede tener uno o varios `Rol`.
- Un `Rol` agrupa muchos `Permiso`.
- Un `Producto` pertenece a una `CategoriaProducto`.
- Un `Producto` tiene un registro de `Inventario`.
- Un `Pedido` pertenece a un `Cliente`.
- Un `Pedido` tiene muchos `DetallePedido`.
- Un `Pedido` puede generar una `Factura`, uno o varios `Pago` y un `Envio`.
- Un `Proveedor` puede estar asociado a muchas `CompraProveedor`.

## Prioridad de tablas para una primera version

1. `cliente`
2. `direccion_envio`
3. `producto`
4. `categoria_producto`
5. `inventario`
6. `pedido`
7. `detalle_pedido`
8. `factura`
9. `pago`
10. `envio`

## Notas de implementacion

- Base de datos objetivo: PostgreSQL.
- Acceso a datos sugerido: JPA/Hibernate.
- Conviene agregar campos de control como `created_at`, `updated_at` y
  `status` en tablas transaccionales.
