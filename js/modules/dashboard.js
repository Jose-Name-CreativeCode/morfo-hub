document.addEventListener("DOMContentLoaded", () => {
  const incomeKey = "morfo_income";
  const expensesKey = "morfo_expenses";
  const clientsKey = "morfo_clients";
  const quotesKey = "morfo_quotes";

  const cards = document.querySelectorAll(".card-value");

  const incomeCard = cards[0];
  const expenseCard = cards[1];
  const utilityCard = cards[2];
  const clientsCard = cards[3];
  const pendingCard = cards[4];

  function getData(key) {
    const data = localStorage.getItem(key);
    return data ? JSON.parse(data) : [];
  }

  function formatCurrency(amount) {
    return Number(amount).toLocaleString("es-MX", {
      style: "currency",
      currency: "MXN",
    });
  }

  function loadDashboardData() {
    const incomes = getData(incomeKey);
    const expenses = getData(expensesKey);
    const clients = getData(clientsKey);
    const quotes = getData(quotesKey);

    const totalIncome = incomes.reduce((sum, item) => {
      return sum + Number(item.totalAmount || 0);
    }, 0);

    const totalExpenses = expenses.reduce((sum, item) => {
      return sum + Number(item.amount || 0);
    }, 0);

    const estimatedUtility = totalIncome - totalExpenses;

    const activeClients = clients.filter(
      (client) => client.status === "Activo",
    ).length;

    const pendingAmount = incomes.reduce((sum, item) => {
      const total = Number(item.totalAmount || 0);
      const paid = Number(item.paidAmount || 0);
      return sum + (total - paid);
    }, 0);

    incomeCard.textContent = formatCurrency(totalIncome);
    expenseCard.textContent = formatCurrency(totalExpenses);
    utilityCard.textContent = formatCurrency(estimatedUtility);
    clientsCard.textContent = activeClients;
    pendingCard.textContent = formatCurrency(pendingAmount);
  }

  loadDashboardData();
});
