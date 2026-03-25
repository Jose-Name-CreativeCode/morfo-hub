document.addEventListener("DOMContentLoaded", () => {
  console.log("income.js cargado correctamente");

  const incomeForm = document.querySelector("form");
  const incomeTableBody = document.querySelector(".table tbody");
  const submitButton = incomeForm.querySelector(".btn-primary");
  const clientSelect = document.getElementById("income-client");

  const STORAGE_KEY = "morfo_income";
  const CLIENTS_KEY = "morfo_clients";

  let editingIncomeId = null;

  function getIncomes() {
    const incomes = localStorage.getItem(STORAGE_KEY);
    return incomes ? JSON.parse(incomes) : [];
  }

  function saveIncomes(incomes) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(incomes));
  }

  function getClients() {
    const clients = localStorage.getItem(CLIENTS_KEY);
    return clients ? JSON.parse(clients) : [];
  }

  function loadClientOptions() {
    const clients = getClients();

    clientSelect.innerHTML = `<option value="">Selecciona un cliente</option>`;

    if (clients.length === 0) {
      clientSelect.innerHTML += `<option value="" disabled>No hay clientes registrados</option>`;
      return;
    }

    clients.forEach((client) => {
      const option = document.createElement("option");
      option.value = client.name;
      option.textContent = client.name;
      clientSelect.appendChild(option);
    });
  }

  function formatCurrency(amount) {
    return Number(amount).toLocaleString("es-MX", {
      style: "currency",
      currency: "MXN",
    });
  }

  function resetForm() {
    incomeForm.reset();
    editingIncomeId = null;
    submitButton.textContent = "Guardar ingreso";
  }

  function renderIncomes() {
    const incomes = getIncomes();
    incomeTableBody.innerHTML = "";

    if (incomes.length === 0) {
      incomeTableBody.innerHTML = `
        <tr>
          <td colspan="9" style="text-align: center;">No hay ingresos registrados.</td>
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
        <td>
          <button type="button" class="edit-btn" data-id="${income.id}">Editar</button>
        </td>
        <td>
          <button type="button" class="delete-btn" data-id="${income.id}">Eliminar</button>
        </td>
      `;

      incomeTableBody.appendChild(row);
    });

    addTableEvents();
  }

  function fillForm(income) {
    document.getElementById("income-client").value = income.client;
    document.getElementById("income-date").value = income.date;
    document.getElementById("income-concept").value = income.concept;
    document.getElementById("income-amount").value = income.totalAmount;
    document.getElementById("income-payment-status").value =
      income.paymentStatus;
    document.getElementById("income-paid-amount").value = income.paidAmount;
    document.getElementById("income-payment-method").value =
      income.paymentMethod;
    document.getElementById("income-invoice").value =
      income.invoiceRequired === "Sí" ? "yes" : "no";
    document.getElementById("income-notes").value = income.notes || "";

    editingIncomeId = income.id;
    submitButton.textContent = "Actualizar ingreso";
  }

  function handleEdit(incomeId) {
    const incomes = getIncomes();
    const incomeToEdit = incomes.find((income) => income.id === incomeId);

    if (!incomeToEdit) return;

    fillForm(incomeToEdit);
  }

  function handleDelete(incomeId) {
    const confirmed = confirm("¿Seguro que quieres eliminar este ingreso?");
    if (!confirmed) return;

    let incomes = getIncomes();
    incomes = incomes.filter((income) => income.id !== incomeId);
    saveIncomes(incomes);

    if (editingIncomeId === incomeId) {
      resetForm();
    }

    renderIncomes();
  }

  function addTableEvents() {
    const editButtons = document.querySelectorAll(".edit-btn");
    const deleteButtons = document.querySelectorAll(".delete-btn");

    editButtons.forEach((button) => {
      button.addEventListener("click", () => {
        const incomeId = Number(button.dataset.id);
        handleEdit(incomeId);
      });
    });

    deleteButtons.forEach((button) => {
      button.addEventListener("click", () => {
        const incomeId = Number(button.dataset.id);
        handleDelete(incomeId);
      });
    });
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

    const incomes = getIncomes();

    if (editingIncomeId) {
      const updatedIncomes = incomes.map((income) =>
        income.id === editingIncomeId
          ? {
              ...income,
              client,
              date,
              concept,
              totalAmount: Number(totalAmount),
              paymentStatus,
              paidAmount: Number(paidAmount),
              paymentMethod,
              invoiceRequired: invoiceRequired === "yes" ? "Sí" : "No",
              notes,
            }
          : income,
      );

      saveIncomes(updatedIncomes);
    } else {
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

      incomes.push(newIncome);
      saveIncomes(incomes);
    }

    renderIncomes();
    resetForm();
    loadClientOptions();
  });

  loadClientOptions();
  renderIncomes();
});
