const NAV_ITEMS = [
  { key: "dashboard", label: "Inicio", href: "dashboard.html" },
  {
    key: "operations",
    label: "Nueva operación",
    href: "operations.html",
  },
  { key: "clients", label: "Clientes", href: "clients.html" },
  { key: "income", label: "Cobros e ingresos", href: "income.html" },
  { key: "expenses", label: "Gastos", href: "expenses.html" },
  { key: "quotes", label: "Cotizaciones", href: "quotes.html" },
  { key: "reports", label: "Reportes", href: "reports.html" },
  { key: "maintenance", label: "Mantenimiento", href: "maintenance.html" },
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

  const brandTitle = document.createElement("div");
  brandTitle.className = "sidebar-brand-title";
  brandTitle.textContent = "Morfo Hub";

  const brandSubtitle = document.createElement("div");
  brandSubtitle.className = "sidebar-brand-subtitle";
  brandSubtitle.textContent = "CRM Suite";

  brand.appendChild(brandTitle);
  brand.appendChild(brandSubtitle);
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

  const titleWrap = document.createElement("div");
  titleWrap.className = "header-title-wrap";

  const kicker = document.createElement("div");
  kicker.className = "header-kicker";
  kicker.textContent = "Workspace";

  const title = document.createElement("div");
  title.className = "header-title";
  title.textContent = pageTitle;

  titleWrap.appendChild(kicker);
  titleWrap.appendChild(title);

  const user = document.createElement("div");
  user.className = "header-user";
  user.textContent = "Verificando sesión...";

  header.appendChild(titleWrap);
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
