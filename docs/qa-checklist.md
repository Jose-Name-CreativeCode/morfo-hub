# Checklist de prueba completa

Usa este flujo despues de cambios importantes para confirmar que Morfo Hub
sigue conectado correctamente con la API y que los saldos se mantienen
consistentes.

## 1. Acceso

1. Abre `login.html`.
2. Inicia sesion con una cuenta autorizada.
3. Confirma que llegas a `dashboard.html`.
4. Verifica que el correo aparece en el encabezado.

## 2. Cliente

1. Crea un cliente de prueba.
2. Confirma que aparece en la tabla de clientes.
3. Abre el detalle del cliente.
4. Edita un dato menor y guarda.

## 3. Cotizacion

1. Crea una cotizacion para el cliente de prueba.
2. Selecciona un tipo de servicio configurado.
3. Confirma que descripcion e incluye se llenan automaticamente.
4. Guarda la cotizacion.
5. Exporta el PDF y revisa que incluya datos de pago y condiciones.

## 4. Anticipo e ingreso

1. En Cotizaciones, abre `Gestionar`.
2. Registra anticipo del 50%.
3. Confirma que se crea un ingreso relacionado.
4. En `income.html`, revisa que aparezcan monto total, pagado y saldo.
5. En `dashboard.html`, confirma que el pendiente por cobrar sea el saldo real.
6. En `reports.html`, confirma que el pendiente del periodo coincida.

## 5. Pago final o correccion

1. Si el cliente paga completo, registra pago final desde la cotizacion.
2. Si hubo error, usa `Corregir pago`.
3. Confirma que Cotizaciones, Ingresos, Dashboard y Reportes muestren el mismo
   saldo.
4. Revisa que el historial de pagos no duplique movimientos obsoletos.

## 6. Gasto

1. Registra un gasto.
2. Usa filtros por mes/categoria/metodo de pago.
3. Confirma que la metrica por categoria se actualice.
4. Exporta Excel si aplica.

## 7. Mantenimiento

1. Abre `maintenance.html`.
2. Haz clic en `Actualizar diagnostico`.
3. Revisa que no haya duplicados o relaciones faltantes.
4. Descarga `Respaldo JSON`.
5. Confirma que el archivo incluya `clients`, `income`, `expenses`, `quotes` y
   `settings`.
6. Selecciona el respaldo descargado en `Restaurar desde respaldo`.
7. Confirma que la vista previa muestre las cantidades esperadas.
8. Cancela la restauracion si solo estas probando la vista previa.
9. Si necesitas restaurar, confirma la accion y revisa que los datos se
   mantengan consistentes despues de recargar.

## Resultado esperado

- No hay errores visibles en consola.
- Las tablas se actualizan despues de guardar.
- Los datos sobreviven al recargar la pagina.
- El dashboard y reportes calculan los mismos saldos.
- El respaldo se descarga correctamente.
- La vista previa de restauracion reconoce el respaldo JSON.
