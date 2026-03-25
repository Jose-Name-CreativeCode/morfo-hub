document.addEventListener("DOMContentLoaded", () => {
  const expenseForm = document.querySelector("form");
  const expenseTableBody = document.querySelector(".table tbody");

  const STORAGE_KEY = "morfo_expenses";

  function getExpenses() {
    const expenses = localStorage.getItem(STORAGE_KEY);
    return expenses ? JSON.parse(expenses) : [];
  }

  function saveExpenses(expenses) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(expenses));
  }

  function formatCurrency(amount) {
    return Number(amount).toLocaleString("es-MX", {
      style: "currency",
      currency: "MXN",
    });
  }

  function renderExpenses() {
    const expenses = getExpenses();
    expenseTableBody.innerHTML = "";

    if (expenses.length === 0) {
      expenseTableBody.innerHTML = `
        <tr>
          <td colspan="6" style="text-align: center;">No hay gastos registrados.</td>
        </tr>
      `;
      return;
    }

    expenses.forEach((expense) => {
      const row = document.createElement("tr");

      row.innerHTML = `
        <td>${expense.date}</td>
        <td>${expense.concept}</td>
        <td>${expense.category}</td>
        <td>${formatCurrency(expense.amount)}</td>
        <td>${expense.paymentMethod}</td>
        <td>${expense.invoice}</td>
      `;

      expenseTableBody.appendChild(row);
    });
  }

  function resetForm() {
    expenseForm.reset();
  }

  expenseForm.addEventListener("submit", (event) => {
    event.preventDefault();

    const date = document.getElementById("expense-date").value;
    const concept = document.getElementById("expense-concept").value.trim();
    const category = document.getElementById("expense-category").value;
    const amount = document.getElementById("expense-amount").value;
    const paymentMethod = document.getElementById(
      "expense-payment-method",
    ).value;
    const invoice = document.getElementById("expense-invoice").value;
    const notes = document.getElementById("expense-notes").value.trim();

    if (
      !date ||
      !concept ||
      !category ||
      !amount ||
      !paymentMethod ||
      !invoice
    ) {
      alert("Por favor, completa todos los campos obligatorios.");
      return;
    }

    const newExpense = {
      id: Date.now(),
      date,
      concept,
      category,
      amount: Number(amount),
      paymentMethod,
      invoice: invoice === "yes" ? "Sí" : "No",
      notes,
    };

    const expenses = getExpenses();
    expenses.push(newExpense);
    saveExpenses(expenses);

    renderExpenses();
    resetForm();
  });

  renderExpenses();
});
