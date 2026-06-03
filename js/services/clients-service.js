import { apiRequest } from "./api-client.js";
import { STORAGE_KEYS, getData, saveData } from "./storage.js";

function sortClients(clients) {
  return [...clients].sort((a, b) => {
    const dateA = Number(a.updatedAtMs || a.createdAtMs || 0);
    const dateB = Number(b.updatedAtMs || b.createdAtMs || 0);

    if (dateA !== dateB) {
      return dateB - dateA;
    }

    return String(a.name || "").localeCompare(String(b.name || ""), "es-MX");
  });
}

function getCachedClients() {
  return getData(STORAGE_KEYS.CLIENTS, []);
}

function mapClientFromApi(client) {
  return {
    ...client,
    invoiceRequired: client.invoiceRequired ? "Sí" : "No",
  };
}

export async function getClientsCollection() {
  const clients = await apiRequest("/clients");
  const mappedClients = clients.map(mapClientFromApi);
  saveData(STORAGE_KEYS.CLIENTS, mappedClients);
  return sortClients(mappedClients);
}

export async function saveClientRecord(client) {
  const payload = {
    ...client,
    invoiceRequired: client.invoiceRequired === "Sí",
  };

  const savedClient = client.id
    ? await apiRequest(`/clients/${client.id}`, {
        method: "PUT",
        body: JSON.stringify(payload),
      })
    : await apiRequest("/clients", {
        method: "POST",
        body: JSON.stringify(payload),
      });

  const mappedClient = mapClientFromApi(savedClient);
  const clients = getCachedClients();
  const nextClients = clients.some(
    (item) => String(item.id) === String(mappedClient.id),
  )
    ? clients.map((item) =>
        String(item.id) === String(mappedClient.id) ? mappedClient : item,
      )
    : [...clients, mappedClient];

  saveData(STORAGE_KEYS.CLIENTS, sortClients(nextClients));
  return mappedClient;
}

export async function deleteClientRecord(clientId) {
  await apiRequest(`/clients/${clientId}`, {
    method: "DELETE",
  });

  const clients = getCachedClients().filter(
    (client) => String(client.id) !== String(clientId),
  );
  saveData(STORAGE_KEYS.CLIENTS, clients);
}
