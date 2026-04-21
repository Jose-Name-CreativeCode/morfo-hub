const NAV_ITEMS = [
  { key: "dashboard", label: "Dashboard", href: "dashboard.html" },
  { key: "clients", label: "Clientes", href: "clients.html" },
  { key: "income", label: "Ingresos", href: "income.html" },
  { key: "expenses", label: "Gastos", href: "expenses.html" },
  { key: "quotes", label: "Cotizaciones", href: "quotes.html" },
  { key: "reports", label: "Reportes", href: "reports.html" },
  { key: "settings", label: "Configuración", href: "settings.html" },
];

function inferNavKey() {
  const currentFile = window.location.pathname.split("/").pop() || "";
  const match = NAV_ITEMS.find((item) => item.href === currentFile);
  return match?.key || "dashboard";
}

function renderSidebar(sidebar, activeKey) {
  sidebar.replaceChildren();

  const brand = document.createElement("div");
  brand.className = "sidebar-brand";
  brand.textContent = "Morfo Hub";
  sidebar.appendChild(brand);

  const nav = document.createElement("nav");
  nav.className = "sidebar-nav";

  const list = document.createElement("ul");

  NAV_ITEMS.forEach((item) => {
    const listItem = document.createElement("li");
    const link = document.createElement("a");
    link.href = item.href;
    link.textContent = item.label;

    if (item.key === activeKey) {
      link.classList.add("active");
    }

    listItem.appendChild(link);
    list.appendChild(listItem);
  });

  nav.appendChild(list);
  sidebar.appendChild(nav);
}

function renderHeader(header, pageTitle) {
  header.replaceChildren();

  const title = document.createElement("div");
  title.className = "header-title";
  title.textContent = pageTitle;

  const user = document.createElement("div");
  user.className = "header-user";
  user.textContent = "Verificando sesión...";

  header.appendChild(title);
  header.appendChild(user);
}

function renderAppShell() {
  const sidebar = document.querySelector("[data-app-sidebar]");
  const header = document.querySelector("[data-app-header]");

  if (!sidebar || !header) return;

  const pageTitle = document.body.dataset.pageTitle || "Morfo Hub";
  const activeKey = document.body.dataset.navKey || inferNavKey();

  renderSidebar(sidebar, activeKey);
  renderHeader(header, pageTitle);
}

renderAppShell();
