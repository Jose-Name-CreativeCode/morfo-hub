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

function enableInstallableApp() {
  if (!document.querySelector('link[rel="manifest"]')) {
    const manifest = document.createElement("link");
    manifest.rel = "manifest";
    manifest.href = "/manifest.webmanifest";
    document.head.appendChild(manifest);
  }

  const theme = document.createElement("meta");
  theme.name = "theme-color";
  theme.content = "#7c5cff";
  document.head.appendChild(theme);

  const isLocal = ["localhost", "127.0.0.1"].includes(window.location.hostname);
  if ("serviceWorker" in navigator && !isLocal) {
    navigator.serviceWorker.register("/sw.js?v=3").catch((error) => {
      console.warn("No se pudo registrar el modo instalable:", error);
    });
  }
}

enableInstallableApp();
