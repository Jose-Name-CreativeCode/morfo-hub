document.addEventListener("DOMContentLoaded", () => {
  const expenseForm = document.querySelector("form");
  const expenseTableBody = document.querySelector(".table tbody");
  const submitButton = expenseForm.querySelector(".btn-primary");

  const STORAGE_KEY = "morfo_expenses";
  let editingExpenseId = null;

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

  function resetForm() {
    expenseForm.reset();
    editingExpenseId = null;
    submitButton.textContent = "Guardar gasto";
  }

  function renderExpenses() {
    const expenses = getExpenses();
    expenseTableBody.innerHTML = "";

    if (expenses.length === 0) {
      expenseTableBody.innerHTML = `
        <tr>
          <td colspan="8" style="text-align: center;">No hay gastos registrados.</td>
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
        <td>
          <button type="button" class="edit-btn" data-id="${expense.id}">Editar</button>
        </td>
        <td>
          <button type="button" class="delete-btn" data-id="${expense.id}">Eliminar</button>
        </td>
      `;

      expenseTableBody.appendChild(row);
    });

    addTableEvents();
  }

  function fillForm(expense) {
    document.getElementById("expense-date").value = expense.date;
    document.getElementById("expense-concept").value = expense.concept;
    document.getElementById("expense-category").value = expense.category;
    document.getElementById("expense-amount").value = expense.amount;
    document.getElementById("expense-payment-method").value =
      expense.paymentMethod;
    document.getElementById("expense-invoice").value =
      expense.invoice === "Sí" ? "yes" : "no";
    document.getElementById("expense-notes").value = expense.notes || "";

    editingExpenseId = expense.id;
    submitButton.textContent = "Actualizar gasto";
  }

  function handleEdit(expenseId) {
    const expenses = getExpenses();
    const expenseToEdit = expenses.find((expense) => expense.id === expenseId);

    if (!expenseToEdit) return;

    fillForm(expenseToEdit);
  }

  function handleDelete(expenseId) {
    const confirmed = confirm("¿Seguro que quieres eliminar este gasto?");
    if (!confirmed) return;

    let expenses = getExpenses();
    expenses = expenses.filter((expense) => expense.id !== expenseId);
    saveExpenses(expenses);

    if (editingExpenseId === expenseId) {
      resetForm();
    }

    renderExpenses();
  }

  function addTableEvents() {
    const editButtons = document.querySelectorAll(".edit-btn");
    const deleteButtons = document.querySelectorAll(".delete-btn");

    editButtons.forEach((button) => {
      button.addEventListener("click", () => {
        const expenseId = Number(button.dataset.id);
        handleEdit(expenseId);
      });
    });

    deleteButtons.forEach((button) => {
      button.addEventListener("click", () => {
        const expenseId = Number(button.dataset.id);
        handleDelete(expenseId);
      });
    });
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

    const expenses = getExpenses();

    if (editingExpenseId) {
      const updatedExpenses = expenses.map((expense) =>
        expense.id === editingExpenseId
          ? {
              ...expense,
              date,
              concept,
              category,
              amount: Number(amount),
              paymentMethod,
              invoice: invoice === "yes" ? "Sí" : "No",
              notes,
            }
          : expense,
      );

      saveExpenses(updatedExpenses);
    } else {
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

      expenses.push(newExpense);
      saveExpenses(expenses);
    }

    renderExpenses();
    resetForm();
  });

  renderExpenses();
});
