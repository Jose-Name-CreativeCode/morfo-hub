# Modelo de datos financiero

## Tablas principales

- `IncomeRecord`: ingresos recibidos o pendientes.
- `ExpenseRecord`: gastos realizados.
- `FinancialAccount`: bancos, efectivo, débito, crédito y ahorro.
- `RecurringRule`: quincenas y compromisos esperados.
- `AppSettings`: configuración de Morfo y presupuestos por espacio.
- `Client` y `QuoteRecord`: operación comercial exclusiva de Morfo.
- `AppUser` y `AppSession`: identidad y sesiones.

## Campos de separación

Ingresos, gastos, cuentas y reglas incluyen:

- `scope`: `personal`, `casa` o `morfo`.
- `ownerUserId`: propietario cuando el espacio es Personal.
- `accountId`: cuenta asociada cuando aplica.

## Compatibilidad de datos

La migración `20260824000000_finance_hub` agrega campos sin borrar registros.
Antes de crear columnas de primer nivel, el espacio estaba guardado dentro de
`rawJson`; la migración copia ese valor para conservar la clasificación.

## Saldos

El saldo estimado parte de `FinancialAccount.startingBalance` y suma o resta
movimientos confirmados asociados mediante `accountId`. Los ingresos pendientes
y las reglas recurrentes no afectan el saldo.

En tarjetas de crédito, `statementDay` y `paymentDay` se guardan por separado.
El sistema no interpreta el corte como salida automática de efectivo.
