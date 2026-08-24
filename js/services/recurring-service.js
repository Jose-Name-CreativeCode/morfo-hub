import { apiRequest } from "./api-client.js";

export function getRecurringRules(scope = "") {
  const query = scope ? `?scope=${encodeURIComponent(scope)}` : "";
  return apiRequest(`/recurring-rules${query}`);
}

export function saveRecurringRule(rule) {
  if (rule.id) {
    return apiRequest(`/recurring-rules/${rule.id}`, {
      method: "PUT",
      body: JSON.stringify(rule),
    });
  }
  return apiRequest("/recurring-rules", {
    method: "POST",
    body: JSON.stringify(rule),
  });
}

export function deleteRecurringRule(ruleId) {
  return apiRequest(`/recurring-rules/${ruleId}`, { method: "DELETE" });
}
