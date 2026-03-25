document.addEventListener("DOMContentLoaded", () => {
  const incomeForm = document.querySelector("form");
  const incomeTableBody = document.querySelector(".table tbody");

  const STORAGE_KEY = "morfo_income";

  function getIncomes() {
    const incomes = localStorage.getItem(STORAGE_KEY);
    return incomes ? JSON.parse(incomes) : [];
  }

  function saveIncomes(incomes) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(incomes));
  }

  function formatCurrency(amount) {
    return Number(amount).toLocaleString("es-MX", {
      style: "currency",
      currency: "MXN",
    });
  }

  function renderIncomes() {
    const incomes = getIncomes();
    incomeTableBody.innerHTML = "";

    if (incomes.length === 0) {
      incomeTableBody.innerHTML = `
        <tr>
          <td colspan="7" style="text-align: center;">No hay ingresos registrados.</td>
        </tr>
      `;
      return;
    }

    incomes.forEach((income) => {
      const row = document.createElement("tr");

      row.innerHTML = `
        <td>${income.client}</td>
        <td>${income.date}</td>
        <td>${income.concept}</td>
        <td>${formatCurrency(income.totalAmount)}</td>
        <td>${formatCurrency(income.paidAmount)}</td>
        <td>${income.paymentStatus}</td>
        <td>${income.invoiceRequired}</td>
      `;

      incomeTableBody.appendChild(row);
    });
  }

  function resetForm() {
    incomeForm.reset();
  }

  incomeForm.addEventListener("submit", (event) => {
    event.preventDefault();

    const client = document.getElementById("income-client").value;
    const date = document.getElementById("income-date").value;
    const concept = document.getElementById("income-concept").value.trim();
    const totalAmount = document.getElementById("income-amount").value;
    const paymentStatus = document.getElementById(
      "income-payment-status",
    ).value;
    const paidAmount = document.getElementById("income-paid-amount").value || 0;
    const paymentMethod = document.getElementById(
      "income-payment-method",
    ).value;
    const invoiceRequired = document.getElementById("income-invoice").value;
    const notes = document.getElementById("income-notes").value.trim();

    if (
      !client ||
      !date ||
      !concept ||
      !totalAmount ||
      !paymentStatus ||
      !paymentMethod ||
      !invoiceRequired
    ) {
      alert("Por favor, completa todos los campos obligatorios.");
      return;
    }

    const newIncome = {
      id: Date.now(),
      client,
      date,
      concept,
      totalAmount: Number(totalAmount),
      paymentStatus,
      paidAmount: Number(paidAmount),
      paymentMethod,
      invoiceRequired: invoiceRequired === "yes" ? "Sí" : "No",
      notes,
    };

    const incomes = getIncomes();
    incomes.push(newIncome);
    saveIncomes(incomes);

    renderIncomes();
    resetForm();
  });

  renderIncomes();
});
