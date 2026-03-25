document.addEventListener("DOMContentLoaded", () => {
  const clientForm = document.querySelector("form");
  const clientTableBody = document.querySelector(".table tbody");
  const submitButton = clientForm.querySelector(".btn-primary");

  const STORAGE_KEY = "morfo_clients";
  let editingClientId = null;

  function getClients() {
    const clients = localStorage.getItem(STORAGE_KEY);
    return clients ? JSON.parse(clients) : [];
  }

  function saveClients(clients) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(clients));
  }

  function resetForm() {
    clientForm.reset();
    editingClientId = null;
    submitButton.textContent = "Guardar cliente";
  }

  function renderClients() {
    const clients = getClients();
    clientTableBody.innerHTML = "";

    if (clients.length === 0) {
      clientTableBody.innerHTML = `
        <tr>
          <td colspan="8" style="text-align: center;">No hay clientes registrados.</td>
        </tr>
      `;
      return;
    }

    clients.forEach((client) => {
      const row = document.createElement("tr");

      row.innerHTML = `
        <td>${client.name}</td>
        <td>${client.contact}</td>
        <td>${client.email}</td>
        <td>${client.phone}</td>
        <td>${client.status}</td>
        <td>${client.invoiceRequired}</td>
        <td>
          <button type="button" class="edit-btn" data-id="${client.id}">Editar</button>
        </td>
        <td>
          <button type="button" class="delete-btn" data-id="${client.id}">Eliminar</button>
        </td>
      `;

      clientTableBody.appendChild(row);
    });

    addTableEvents();
  }

  function fillForm(client) {
    document.getElementById("client-name").value = client.name;
    document.getElementById("client-contact").value = client.contact;
    document.getElementById("client-email").value = client.email;
    document.getElementById("client-phone").value = client.phone;
    document.getElementById("client-status").value = client.status;
    document.getElementById("client-invoice").value =
      client.invoiceRequired === "Sí" ? "yes" : "no";
    document.getElementById("client-notes").value = client.notes || "";

    editingClientId = client.id;
    submitButton.textContent = "Actualizar cliente";
  }

  function handleEdit(clientId) {
    const clients = getClients();
    const clientToEdit = clients.find((client) => client.id === clientId);

    if (!clientToEdit) return;

    fillForm(clientToEdit);
  }

  function handleDelete(clientId) {
    const confirmed = confirm("¿Seguro que quieres eliminar este cliente?");
    if (!confirmed) return;

    let clients = getClients();
    clients = clients.filter((client) => client.id !== clientId);
    saveClients(clients);

    if (editingClientId === clientId) {
      resetForm();
    }

    renderClients();
  }

  function addTableEvents() {
    const editButtons = document.querySelectorAll(".edit-btn");
    const deleteButtons = document.querySelectorAll(".delete-btn");

    editButtons.forEach((button) => {
      button.addEventListener("click", () => {
        const clientId = Number(button.dataset.id);
        handleEdit(clientId);
      });
    });

    deleteButtons.forEach((button) => {
      button.addEventListener("click", () => {
        const clientId = Number(button.dataset.id);
        handleDelete(clientId);
      });
    });
  }

  clientForm.addEventListener("submit", (event) => {
    event.preventDefault();

    const name = document.getElementById("client-name").value.trim();
    const contact = document.getElementById("client-contact").value.trim();
    const email = document.getElementById("client-email").value.trim();
    const phone = document.getElementById("client-phone").value.trim();
    const status = document.getElementById("client-status").value;
    const invoiceRequired = document.getElementById("client-invoice").value;
    const notes = document.getElementById("client-notes").value.trim();

    if (!name || !contact || !email || !phone || !status || !invoiceRequired) {
      alert("Por favor, completa todos los campos obligatorios.");
      return;
    }

    const clients = getClients();

    if (editingClientId) {
      const updatedClients = clients.map((client) =>
        client.id === editingClientId
          ? {
              ...client,
              name,
              contact,
              email,
              phone,
              status,
              invoiceRequired: invoiceRequired === "yes" ? "Sí" : "No",
              notes,
            }
          : client,
      );

      saveClients(updatedClients);
    } else {
      const newClient = {
        id: Date.now(),
        name,
        contact,
        email,
        phone,
        status,
        invoiceRequired: invoiceRequired === "yes" ? "Sí" : "No",
        notes,
      };

      clients.push(newClient);
      saveClients(clients);
    }

    renderClients();
    resetForm();
  });

  renderClients();
});
