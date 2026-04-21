import "./navigation.js";

function openDatePicker(input) {
  if (!(input instanceof HTMLInputElement) || input.type !== "date") return;
  if (typeof input.showPicker !== "function") return;

  try {
    input.showPicker();
  } catch {
    // Some browsers only allow showPicker during trusted interactions.
  }
}

function enableDatePickerClickArea() {
  document.addEventListener("click", (event) => {
    const input = event.target.closest('input[type="date"]');
    if (!input) return;

    openDatePicker(input);
  });

  document.addEventListener("keydown", (event) => {
    const input = event.target;
    if (!(input instanceof HTMLInputElement) || input.type !== "date") return;
    if (event.key !== "Enter" && event.key !== " ") return;

    event.preventDefault();
    openDatePicker(input);
  });
}

enableDatePickerClickArea();
