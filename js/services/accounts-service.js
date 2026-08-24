import { apiRequest } from "./api-client.js";

export function getAccountsCollection(scope = "") {
  const query = scope ? `?scope=${encodeURIComponent(scope)}` : "";
  return apiRequest(`/accounts${query}`);
}

export function saveAccount(account) {
  if (account.id) {
    return apiRequest(`/accounts/${account.id}`, {
      method: "PUT",
      body: JSON.stringify(account),
    });
  }
  return apiRequest("/accounts", {
    method: "POST",
    body: JSON.stringify(account),
  });
}

export function archiveAccount(accountId) {
  return apiRequest(`/accounts/${accountId}`, { method: "DELETE" });
}
