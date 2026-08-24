import {
  SCOPES,
  getActiveScope,
  getScopeConfig,
  withScopeParam,
} from "./scopes.js";

const NAV_ITEMS = [
  { key: "dashboard", label: "Inicio", href: "dashboard.html" },
  { key: "clients", label: "Clientes", href: "clients.html" },
  { key: "income", label: "Cobros e ingresos", href: "income.html" },
  { key: "expenses", label: "Gastos", href: "expenses.html" },
  { key: "quotes", label: "Cotizaciones", href: "quotes.html" },
  { key: "reports", label: "Reportes", href: "reports.html" },
  { key: "maintenance", label: "Mantenimiento", href: "maintenance.html" },
  { key: "settings", label: "Configuración", href: "settings.html" },
];

const MOBILE_BREAKPOINT = 900;

function getNavItem(key) {
  return NAV_ITEMS.find((item) => item.key === key);
}

function inferNavKey() {
  const currentFile = window.location.pathname.split("/").pop() || "";
  const match = NAV_ITEMS.find((item) => item.href === currentFile);
  return match?.key || "dashboard";
}

function renderScopeSwitcher(sidebar, activeScope) {
  const switcher = document.createElement("div");
  switcher.className = "scope-switcher";
  switcher.setAttribute("role", "tablist");
  switcher.setAttribute("aria-label", "Espacio de trabajo");

  Object.values(SCOPES).forEach((scope) => {
    const link = document.createElement("a");
    const target = getNavItem(scope.homeKey)?.href || "expenses.html";

    link.className = "scope-tab";
    link.href = withScopeParam(target, scope.key);
    link.textContent = scope.label;
    link.setAttribute("role", "tab");

    if (scope.key === activeScope) {
      link.classList.add("active");
      link.setAttribute("aria-selected", "true");
    } else {
      link.setAttribute("aria-selected", "false");
    }

    switcher.appendChild(link);
  });

  sidebar.appendChild(switcher);
}

function renderSidebar(sidebar, activeKey) {
  sidebar.replaceChildren();
  sidebar.setAttribute("aria-hidden", "false");

  const activeScope = getActiveScope();
  const scopeConfig = getScopeConfig(activeScope);

  const brand = document.createElement("div");
  brand.className = "sidebar-brand";
  brand.textContent = "Morfo Hub";
  sidebar.appendChild(brand);

  renderScopeSwitcher(sidebar, activeScope);

  const nav = document.createElement("nav");
  nav.className = "sidebar-nav";

  const list = document.createElement("ul");

  scopeConfig.navKeys.forEach((key) => {
    const item = getNavItem(key);
    if (!item) return;

    const listItem = document.createElement("li");
    const link = document.createElement("a");
    link.href = withScopeParam(item.href, activeScope);
    link.textContent = scopeConfig.navLabels?.[key] || item.label;

    if (item.key === activeKey) {
      link.classList.add("active");
    }

    link.addEventListener("click", () => {
      if (window.innerWidth <= MOBILE_BREAKPOINT) {
        document.body.classList.remove("sidebar-open");
      }
    });

    listItem.appendChild(link);
    list.appendChild(listItem);
  });

  nav.appendChild(list);
  sidebar.appendChild(nav);
}

function renderHeader(header, pageTitle) {
  header.replaceChildren();

  const headerMain = document.createElement("div");
  headerMain.className = "header-main";

  const mobileMenuButton = document.createElement("button");
  mobileMenuButton.type = "button";
  mobileMenuButton.className = "menu-toggle-btn";
  mobileMenuButton.setAttribute("aria-label", "Abrir menú");
  mobileMenuButton.setAttribute("aria-expanded", "false");
  mobileMenuButton.innerHTML = `
    <span></span>
    <span></span>
    <span></span>
  `;

  const title = document.createElement("div");
  title.className = "header-title";
  title.textContent = pageTitle;

  const scopeBadge = document.createElement("span");
  scopeBadge.className = "header-scope-badge";
  scopeBadge.textContent = getScopeConfig().label;

  headerMain.appendChild(mobileMenuButton);
  headerMain.appendChild(title);
  headerMain.appendChild(scopeBadge);

  const user = document.createElement("div");
  user.className = "header-user";
  user.textContent = "Verificando sesión...";

  header.appendChild(headerMain);
  header.appendChild(user);
}

function syncMobileNavState() {
  const isMobile = window.innerWidth <= MOBILE_BREAKPOINT;
  const menuButton = document.querySelector(".menu-toggle-btn");
  const sidebar = document.querySelector(".sidebar");

  if (!isMobile) {
    document.body.classList.remove("sidebar-open");
  }

  if (menuButton) {
    menuButton.setAttribute(
      "aria-expanded",
      isMobile && document.body.classList.contains("sidebar-open")
        ? "true"
        : "false",
    );
  }

  if (sidebar) {
    sidebar.setAttribute(
      "aria-hidden",
      isMobile && !document.body.classList.contains("sidebar-open")
        ? "true"
        : "false",
    );
  }
}

function setupMobileSidebar() {
  const appLayout = document.querySelector(".app-layout");
  const sidebar = document.querySelector(".sidebar");
  const menuButton = document.querySelector(".menu-toggle-btn");

  if (!appLayout || !sidebar || !menuButton) return;

  let overlay = document.querySelector(".sidebar-overlay");

  if (!overlay) {
    overlay = document.createElement("button");
    overlay.type = "button";
    overlay.className = "sidebar-overlay";
    overlay.setAttribute("aria-label", "Cerrar menú");
    appLayout.appendChild(overlay);
  }

  const closeSidebar = () => {
    document.body.classList.remove("sidebar-open");
    syncMobileNavState();
  };

  const openSidebar = () => {
    document.body.classList.add("sidebar-open");
    syncMobileNavState();
  };

  menuButton.addEventListener("click", () => {
    if (document.body.classList.contains("sidebar-open")) {
      closeSidebar();
      return;
    }

    openSidebar();
  });

  overlay.addEventListener("click", closeSidebar);

  window.addEventListener("resize", syncMobileNavState);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeSidebar();
    }
  });

  syncMobileNavState();
}

function renderAppShell() {
  const sidebar = document.querySelector("[data-app-sidebar]");
  const header = document.querySelector("[data-app-header]");

  if (!sidebar || !header) return;

  const pageTitle = document.body.dataset.pageTitle || "Morfo Hub";
  const activeKey = document.body.dataset.navKey || inferNavKey();

  renderSidebar(sidebar, activeKey);
  renderHeader(header, pageTitle);
  setupMobileSidebar();
}

renderAppShell();
