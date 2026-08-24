/**
 * Balance de Casa basado exclusivamente en movimientos confirmados.
 * Corte y fecha de pago de una tarjeta se modelan en la cuenta, no aquí.
 */
export function computeCasaBalance(incomes, expenses) {
  const totalIncome = incomes.reduce(
    (sum, income) => sum + Number(income.paidAmount || 0),
    0,
  );
  const settledExpenses = expenses.reduce(
    (sum, expense) => sum + Number(expense.amount || 0),
    0,
  );

  return {
    totalIncome,
    settledExpenses,
    pendingExpenses: 0,
    balance: totalIncome - settledExpenses,
  };
}
