/**
 * Descarga un reporte de gastos en Excel. Requiere que la página cargue
 * ExcelJS y FileSaver; devuelve false si no están disponibles.
 */
export async function exportExpensesToExcel(expenses, { subtitle, fileName }) {
  if (typeof ExcelJS === "undefined" || typeof saveAs === "undefined") {
    return false;
  }

  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("Gastos", {
    views: [{ state: "frozen", ySplit: 4 }],
  });

  const totalGastos = expenses.reduce(
    (sum, expense) => sum + Number(expense.amount || 0),
    0,
  );

  worksheet.mergeCells("A1:F1");
  worksheet.getCell("A1").value = "REPORTE DE GASTOS";
  worksheet.getCell("A1").font = {
    size: 18,
    bold: true,
    color: { argb: "FFFFFFFF" },
  };
  worksheet.getCell("A1").alignment = {
    horizontal: "center",
    vertical: "middle",
  };
  worksheet.getCell("A1").fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFB91C1C" },
  };
  worksheet.getRow(1).height = 28;

  worksheet.mergeCells("A2:F2");
  worksheet.getCell("A2").value = subtitle;
  worksheet.getCell("A2").font = {
    italic: true,
    color: { argb: "FF334155" },
  };
  worksheet.getCell("A2").alignment = {
    horizontal: "center",
    vertical: "middle",
  };
  worksheet.getCell("A2").fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFFEF2F2" },
  };

  const headers = [
    "Fecha",
    "Concepto",
    "Categoría",
    "Monto",
    "Método de pago",
    "Factura",
    "Observaciones",
  ];

  worksheet.addRow([]);
  const headerRow = worksheet.addRow(headers);

  headerRow.eachCell((cell) => {
    cell.font = {
      bold: true,
      color: { argb: "FFFFFFFF" },
    };
    cell.alignment = {
      horizontal: "center",
      vertical: "middle",
      wrapText: true,
    };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFDC2626" },
    };
    cell.border = {
      top: { style: "thin", color: { argb: "FFCBD5E1" } },
      left: { style: "thin", color: { argb: "FFCBD5E1" } },
      bottom: { style: "thin", color: { argb: "FFCBD5E1" } },
      right: { style: "thin", color: { argb: "FFCBD5E1" } },
    };
  });

  expenses.forEach((expense) => {
    const row = worksheet.addRow([
      expense.date || "-",
      expense.concept || "-",
      expense.category || "-",
      Number(expense.amount || 0),
      expense.paymentMethod || "-",
      expense.invoice || "-",
      expense.notes || "",
    ]);

    row.eachCell((cell, colNumber) => {
      cell.alignment = {
        vertical: "middle",
        wrapText: true,
        horizontal: colNumber === 4 ? "right" : "left",
      };

      cell.border = {
        top: { style: "thin", color: { argb: "FFE2E8F0" } },
        left: { style: "thin", color: { argb: "FFE2E8F0" } },
        bottom: { style: "thin", color: { argb: "FFE2E8F0" } },
        right: { style: "thin", color: { argb: "FFE2E8F0" } },
      };
    });

    row.getCell(4).numFmt = "$#,##0.00";
  });

  worksheet.addRow([]);

  const totalRow = worksheet.addRow([
    "",
    "",
    "TOTAL GASTOS",
    totalGastos,
    "",
    "",
    "",
  ]);

  totalRow.eachCell((cell) => {
    cell.font = { bold: true };
    cell.alignment = {
      vertical: "middle",
      horizontal: "center",
    };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFFEE2E2" },
    };
    cell.border = {
      top: { style: "thin", color: { argb: "FF94A3B8" } },
      left: { style: "thin", color: { argb: "FF94A3B8" } },
      bottom: { style: "thin", color: { argb: "FF94A3B8" } },
      right: { style: "thin", color: { argb: "FF94A3B8" } },
    };
  });

  totalRow.getCell(4).numFmt = "$#,##0.00";

  worksheet.columns = [
    { width: 14 },
    { width: 30 },
    { width: 22 },
    { width: 16 },
    { width: 18 },
    { width: 12 },
    { width: 40 },
  ];

  worksheet.autoFilter = {
    from: "A4",
    to: "G4",
  };

  const buffer = await workbook.xlsx.writeBuffer();

  saveAs(
    new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
    fileName,
  );
  return true;
}
