# QA funcional real

Yo uso esta guía cuando quiero validar que Morfo Hub sigue estable en operación
real, especialmente después de cambios importantes en Vercel, Neon o en los
módulos de clientes, cotizaciones, ingresos, gastos y reportes.

## Objetivo

Yo confirmo estas 5 cosas:

- yo puedo entrar y moverme por el sistema sin errores
- yo puedo guardar datos y siguen existiendo después de recargar
- yo no veo duplicados raros entre cotizaciones e ingresos
- yo veo los mismos números en tablas, dashboard y reportes
- yo puedo sacar respaldos y exportaciones sin perder información

## Preparación

Antes de empezar, yo preparo esto:

1. Yo entro a la app en producción.
2. Yo inicio sesión con una cuenta real.
3. Yo tengo a la mano un cliente de prueba o creo uno nuevo.
4. Yo abro [docs/qa-log-template.md](/Users/jose/Downloads/morfo-hub/docs/qa-log-template.md) para ir apuntando cualquier falla.

## Prioridad inicial por módulo

Yo empezaría en este orden, porque aquí está el flujo más sensible del sistema:

1. `Cotizaciones`
   Yo reviso guardado, edición, cambio de estado y la relación con ingresos.
2. `Cobros e ingresos`
   Yo reviso ingresos manuales, ingresos nacidos desde cotización y que no haya duplicados.
3. `Gastos`
   Yo reviso altas nuevas, persistencia después de recargar, filtros y exportación.
4. `Reportes`
   Yo confirmo que los números coincidan con ingresos, gastos y cotizaciones reales.
5. `Clientes`
   Yo reviso alta, edición, búsqueda y detalle.

## Puntos críticos que yo revisaría con más atención

- En `Cotizaciones`, yo reviso los 4 modos de guardado:
  `borrador`, `enviada`, `aprobada` y `pagada`.
- En `Cotizaciones`, yo confirmo que una cotización `aprobada` sí genere o sincronice un ingreso pendiente.
- En `Cotizaciones`, yo confirmo que una cotización `pagada` sí cree o actualice el ingreso ligado.
- En `Cobros e ingresos`, yo reviso que editar un ingreso no cree otro.
- En `Cobros e ingresos`, yo reviso que un ingreso ligado a cotización conserve bien la relación.
- En `Gastos`, yo confirmo que nunca se pida capturar un `id`.
- En `Reportes`, yo comparo cifras contra tablas reales, porque ahí se combinan ingresos, gastos y cotizaciones.

## Prueba 1: acceso y navegación

1. Yo abro `login.html`.
2. Yo inicio sesión con una cuenta autorizada.
3. Yo confirmo que llego a `dashboard.html`.
4. Yo reviso que el nombre del usuario salga correctamente en el encabezado.
5. Yo entro a estas pantallas y confirmo que cargan bien:
- `Inicio`
- `Nueva operación`
- `Clientes`
- `Cobros e ingresos`
- `Gastos`
- `Cotizaciones`
- `Reportes`
- `Mantenimiento`
- `Configuración`

## Prueba 2: cliente

1. Yo creo un cliente nuevo de prueba.
2. Yo confirmo que aparece en la tabla.
3. Yo recargo la página.
4. Yo confirmo que el cliente sigue ahí.
5. Yo abro el detalle del cliente.
6. Yo edito un dato pequeño y guardo.
7. Yo recargo otra vez para confirmar que sí persistió.

## Prueba 3: cotización

1. Yo creo una cotización nueva para el cliente de prueba.
2. Yo lleno concepto, monto, fecha y los campos mínimos del flujo.
3. Yo guardo como borrador.
4. Yo recargo la página.
5. Yo confirmo que la cotización sigue ahí.
6. Yo la cambio a enviada o aprobada, según el caso que quiera probar.
7. Yo confirmo que no se duplica y que el estado cambia correctamente.

## Prueba 4: ingreso ligado a cotización

1. Yo tomo una cotización y la marco con el flujo que debe generar ingreso.
2. Yo confirmo que aparece un ingreso relacionado.
3. Yo entro a `Cobros e ingresos`.
4. Yo reviso que el ingreso tenga relación correcta con la cotización.
5. Yo confirmo que monto, saldo y estado coinciden.
6. Yo recargo la página.
7. Yo confirmo que el ingreso sigue ahí y no se duplicó.

## Prueba 5: ingreso manual

1. Yo creo un ingreso manual nuevo.
2. Yo guardo.
3. Yo confirmo que aparece en la tabla.
4. Yo recargo la página.
5. Yo confirmo que sigue ahí.
6. Yo pruebo editarlo y guardar de nuevo.

## Prueba 6: gasto

1. Yo creo un gasto nuevo.
2. Yo guardo.
3. Yo confirmo que aparece en la tabla.
4. Yo recargo la página.
5. Yo confirmo que sigue ahí.
6. Yo pruebo los filtros por fecha, categoría o método de pago.
7. Yo confirmo que los totales cambian de forma coherente.

## Prueba 7: dashboard y reportes

1. Yo entro a `Inicio`.
2. Yo reviso que refleje los cambios hechos en clientes, ingresos y gastos.
3. Yo entro a `Reportes`.
4. Yo confirmo que los números del periodo tengan sentido.
5. Yo exporto PDF.
6. Yo exporto Excel.
7. Yo reviso que los archivos se descarguen bien y tengan información real.

## Prueba 8: mantenimiento y respaldo

1. Yo entro a `Mantenimiento`.
2. Yo descargo un respaldo JSON.
3. Yo confirmo que el archivo incluya datos de:
- `clients`
- `income`
- `expenses`
- `quotes`
- `settings`
4. Yo pruebo la vista previa de restauración con ese respaldo.
5. Yo confirmo que la vista previa reconozca cantidades correctas.
6. Yo cancelo la restauración si solo estoy haciendo prueba.

## Señales de alerta

Yo marco una incidencia si veo cualquiera de estas cosas:

- yo guardo y el registro desaparece al recargar
- yo veo duplicados después de guardar o cambiar estado
- yo veo totales distintos entre tabla, dashboard y reportes
- yo tengo que escribir un `id` manualmente
- yo exporto y el archivo sale vacío o incompleto
- yo veo mensajes de error al guardar, editar o eliminar

## Criterio de aprobación

Yo doy por aprobada la ronda cuando:

- yo puedo crear, editar y volver a ver clientes, cotizaciones, ingresos y gastos
- yo no tengo errores visibles en el flujo principal
- yo la relación `cotización -> ingreso` se mantiene estable
- yo dashboard y reportes muestran cifras coherentes
- yo respaldo y exportaciones funcionan bien

## Cómo usarla en operación real

Yo recomiendo hacer esta ronda así:

1. Yo hago una prueba completa hoy.
2. Yo uso la app normalmente durante 5 a 7 días.
3. Yo apunto cada fricción en [docs/qa-log-template.md](/Users/jose/Downloads/morfo-hub/docs/qa-log-template.md).
4. Yo después corrijo primero lo que más se repita.
