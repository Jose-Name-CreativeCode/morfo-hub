document.addEventListener("DOMContentLoaded", () => {
  const reportForm = document.querySelector("form");

  const incomeKey = "morfo_income";
  const expensesKey = "morfo_expenses";
  const clientsKey = "morfo_clients";
  const quotesKey = "morfo_quotes";

  const incomeCard = document.querySelectorAll(".card-value")[0];
  const expenseCard = document.querySelectorAll(".card-value")[1];
  const utilityCard = document.querySelectorAll(".card-value")[2];
  const pendingCard = document.querySelectorAll(".card-value")[3];
  const quotesCard = document.querySelectorAll(".card-value")[4];
  const tableBody = document.querySelector(".table tbody");

  function getData(key) {
    const data = localStorage.getItem(key);
    return data ? JSON.parse(data) : [];
  }

  function formatCurrency(amount) {
    return Number(amount).toLocaleString("es-MX", {
      style: "currency",
      currency: "MXN",
    });
  }

  function getFilteredMonthYear(items, dateField, month, year) {
    return items.filter((item) => {
      if (!item[dateField]) return false;

      const itemDate = new Date(item[dateField]);
      const itemMonth = String(itemDate.getMonth() + 1).padStart(2, "0");
      const itemYear = String(itemDate.getFullYear());

      const matchesMonth = month ? itemMonth === month : true;
      const matchesYear = year ? itemYear === year : true;

      return matchesMonth && matchesYear;
    });
  }

  function renderTableRows(type, data) {
    tableBody.innerHTML = "";

    if (data.length === 0) {
      tableBody.innerHTML = `
        <tr>
          <td colspan="5" style="text-align: center;">No hay datos para este filtro.</td>
        </tr>
      `;
      return;
    }

    data.forEach((item) => {
      const row = document.createElement("tr");

      if (type === "income") {
        row.innerHTML = `
          <td>${item.concept}</td>
          <td>Ingreso</td>
          <td>${item.date}</td>
          <td>${formatCurrency(item.totalAmount)}</td>
          <td>Ingreso</td>
        `;
      } else if (type === "expenses") {
        row.innerHTML = `
          <td>${item.concept}</td>
          <td>${item.category}</td>
          <td>${item.date}</td>
          <td>${formatCurrency(item.amount)}</td>
          <td>Gasto</td>
        `;
      } else if (type === "clients") {
        row.innerHTML = `
          <td>${item.name}</td>
          <td>${item.status}</td>
          <td>-</td>
          <td>-</td>
          <td>Cliente</td>
        `;
      } else if (type === "quotes") {
        row.innerHTML = `
          <td>${item.title}</td>
          <td>${item.serviceType}</td>
          <td>${item.date}</td>
          <td>${formatCurrency(item.total)}</td>
          <td>Cotización</td>
        `;
      } else {
        row.innerHTML = `
          <td>${item.concept}</td>
          <td>${item.category}</td>
          <td>${item.date}</td>
          <td>${formatCurrency(item.amount)}</td>
          <td>${item.type}</td>
        `;
      }

      tableBody.appendChild(row);
    });
  }

  function generateReport(month, year, reportType) {
    const incomes = getFilteredMonthYear(
      getData(incomeKey),
      "date",
      month,
      year,
    );
    const expenses = getFilteredMonthYear(
      getData(expensesKey),
      "date",
      month,
      year,
    );
    const quotes = getFilteredMonthYear(
      getData(quotesKey),
      "date",
      month,
      year,
    );
    const clients = getData(clientsKey);

    const totalIncome = incomes.reduce(
      (sum, item) => sum + Number(item.totalAmount || 0),
      0,
    );
    const totalExpenses = expenses.reduce(
      (sum, item) => sum + Number(item.amount || 0),
      0,
    );
    const estimatedUtility = totalIncome - totalExpenses;

    const pendingAmount = incomes.reduce((sum, item) => {
      const total = Number(item.totalAmount || 0);
      const paid = Number(item.paidAmount || 0);
      return sum + (total - paid);
    }, 0);

    incomeCard.textContent = formatCurrency(totalIncome);
    expenseCard.textContent = formatCurrency(totalExpenses);
    utilityCard.textContent = formatCurrency(estimatedUtility);
    pendingCard.textContent = formatCurrency(pendingAmount);
    quotesCard.textContent = quotes.length;

    if (reportType === "income") {
      renderTableRows("income", incomes);
    } else if (reportType === "expenses") {
      renderTableRows("expenses", expenses);
    } else if (reportType === "clients") {
      renderTableRows("clients", clients);
    } else if (reportType === "quotes") {
      renderTableRows("quotes", quotes);
    } else {
      const combined = [
        ...incomes.map((item) => ({
          concept: item.concept,
          category: "Ingreso",
          date: item.date,
          amount: item.totalAmount,
          type: "Ingreso",
        })),
        ...expenses.map((item) => ({
          concept: item.concept,
          category: item.category,
          date: item.date,
          amount: item.amount,
          type: "Gasto",
        })),
      ].sort((a, b) => new Date(b.date) - new Date(a.date));

      renderTableRows("general", combined);
    }
  }

  reportForm.addEventListener("submit", (event) => {
    event.preventDefault();

    const month = document.getElementById("report-month").value;
    const year = document.getElementById("report-year").value.trim();
    const reportType = document.getElementById("report-type").value;

    generateReport(month, year, reportType);
  });

  generateReport("", "", "general");
});
