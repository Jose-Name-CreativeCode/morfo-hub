import { protectPage } from "../services/auth.js";
import {
  deleteClientRecord,
  getClientsCollection,
  saveClientRecord,
} from "../services/clients-service.js";

document.addEventListener("DOMContentLoaded", async () => {
  await protectPage();

  const clientForm = document.querySelector("form");
  const clientTableBody = document.querySelector(".table tbody");
  const submitButton = clientForm.querySelector(".btn-primary");
  let editingClientId = null;
  let currentClients = [];

  function resetForm() {
    clientForm.reset();
    editingClientId = null;
    submitButton.textContent = "Guardar cliente";
  }

  function createCell(text) {
    const cell = document.createElement("td");
    cell.textContent = text;
    return cell;
  }

  async function renderClients() {
    currentClients = await getClientsCollection();
    clientTableBody.innerHTML = "";

    if (currentClients.length === 0) {
      clientTableBody.innerHTML = `
        <tr>
          <td colspan="8" style="text-align: center;">No hay clientes registrados.</td>
        </tr>
      `;
      return;
    }

    currentClients.forEach((client) => {
      const row = document.createElement("tr");

      row.appendChild(createCell(client.name));
      row.appendChild(createCell(client.contact));
      row.appendChild(createCell(client.email));
      row.appendChild(createCell(client.phone));
      row.appendChild(createCell(client.status));
      row.appendChild(createCell(client.invoiceRequired));

      const editCell = document.createElement("td");
      const editButton = document.createElement("button");
      editButton.type = "button";
      editButton.className = "edit-btn";
      editButton.dataset.id = String(client.id);
      editButton.textContent = "Editar";
      editCell.appendChild(editButton);
      row.appendChild(editCell);

      const deleteCell = document.createElement("td");
      const deleteButton = document.createElement("button");
      deleteButton.type = "button";
      deleteButton.className = "delete-btn";
      deleteButton.dataset.id = String(client.id);
      deleteButton.textContent = "Eliminar";
      deleteCell.appendChild(deleteButton);
      row.appendChild(deleteCell);

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
    const clientToEdit = currentClients.find(
      (client) => String(client.id) === String(clientId),
    );

    if (!clientToEdit) return;

    fillForm(clientToEdit);
  }

  async function handleDelete(clientId) {
    const confirmed = confirm("¿Seguro que quieres eliminar este cliente?");
    if (!confirmed) return;

    await deleteClientRecord(clientId);

    if (editingClientId === clientId) {
      resetForm();
    }

    await renderClients();
  }

  function addTableEvents() {
    const editButtons = document.querySelectorAll(".edit-btn");
    const deleteButtons = document.querySelectorAll(".delete-btn");

    editButtons.forEach((button) => {
      button.addEventListener("click", () => {
        const clientId = button.dataset.id;
        handleEdit(clientId);
      });
    });

    deleteButtons.forEach((button) => {
      button.addEventListener("click", async () => {
        const clientId = button.dataset.id;
        await handleDelete(clientId);
      });
    });
  }

  clientForm.addEventListener("submit", async (event) => {
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

    await saveClientRecord({
      id: editingClientId,
      name,
      contact,
      email,
      phone,
      status,
      invoiceRequired: invoiceRequired === "yes" ? "Sí" : "No",
      notes,
    });

    await renderClients();
    resetForm();
  });

  await renderClients();
});
