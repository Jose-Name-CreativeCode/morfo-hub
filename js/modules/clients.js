document.addEventListener("DOMContentLoaded", () => {
  const clientForm = document.querySelector("form");
  const clientTableBody = document.querySelector(".table tbody");

  const STORAGE_KEY = "morfo_clients";

  function getClients() {
    const clients = localStorage.getItem(STORAGE_KEY);
    return clients ? JSON.parse(clients) : [];
  }

  function saveClients(clients) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(clients));
  }

  function renderClients() {
    const clients = getClients();
    clientTableBody.innerHTML = "";

    if (clients.length === 0) {
      clientTableBody.innerHTML = `
        <tr>
          <td colspan="6" style="text-align: center;">No hay clientes registrados.</td>
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
      `;

      clientTableBody.appendChild(row);
    });
  }

  function resetForm() {
    clientForm.reset();
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

    const clients = getClients();
    clients.push(newClient);
    saveClients(clients);

    renderClients();
    resetForm();
  });

  renderClients();
});
