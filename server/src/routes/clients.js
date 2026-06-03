import { Router } from "express";
import { prisma } from "../lib/prisma.js";

export const clientsRouter = Router();

function mapClientPayload(body = {}) {
  const normalizedInvoice = String(body.invoiceRequired || "")
    .trim()
    .toLowerCase();

  return {
    name: String(body.name || "").trim(),
    contact: body.contact ? String(body.contact).trim() : null,
    email: body.email ? String(body.email).trim() : null,
    phone: body.phone ? String(body.phone).trim() : null,
    status: body.status ? String(body.status).trim() : null,
    invoiceRequired:
      normalizedInvoice === "si" ||
      normalizedInvoice === "sí" ||
      normalizedInvoice === "yes" ||
      normalizedInvoice === "true",
    notes: body.notes ? String(body.notes) : "",
  };
}

clientsRouter.get("/", async (_request, response) => {
  const clients = await prisma.client.findMany({
    orderBy: [{ updatedAt: "desc" }, { name: "asc" }],
  });

  response.json(clients);
});

clientsRouter.get("/:id", async (request, response) => {
  const client = await prisma.client.findUnique({
    where: { id: request.params.id },
  });

  if (!client) {
    response.status(404).json({
      error: "client_not_found",
      message: "No se encontró el cliente solicitado.",
    });
    return;
  }

  response.json(client);
});

clientsRouter.post("/", async (request, response) => {
  const payload = mapClientPayload(request.body);

  if (!payload.name) {
    response.status(400).json({
      error: "invalid_client_name",
      message: "El nombre del cliente es obligatorio.",
    });
    return;
  }

  const client = await prisma.client.create({
    data: payload,
  });

  response.status(201).json(client);
});

clientsRouter.put("/:id", async (request, response) => {
  const existingClient = await prisma.client.findUnique({
    where: { id: request.params.id },
  });

  if (!existingClient) {
    response.status(404).json({
      error: "client_not_found",
      message: "No se encontró el cliente solicitado.",
    });
    return;
  }

  const payload = mapClientPayload(request.body);

  if (!payload.name) {
    response.status(400).json({
      error: "invalid_client_name",
      message: "El nombre del cliente es obligatorio.",
    });
    return;
  }

  const client = await prisma.client.update({
    where: { id: request.params.id },
    data: payload,
  });

  response.json(client);
});

clientsRouter.delete("/:id", async (request, response) => {
  const existingClient = await prisma.client.findUnique({
    where: { id: request.params.id },
  });

  if (!existingClient) {
    response.status(404).json({
      error: "client_not_found",
      message: "No se encontró el cliente solicitado.",
    });
    return;
  }

  await prisma.client.delete({
    where: { id: request.params.id },
  });

  response.status(204).send();
});
