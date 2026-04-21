import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import { STORAGE_KEYS, getData, saveData } from "./storage.js";
import { db, isFirebaseConfigured } from "./firebase-config.js";

const COLLECTION_NAME = "clients";

function sortClients(clients) {
  return [...clients].sort((a, b) => {
    const dateA = Number(a.updatedAtMs || a.createdAtMs || 0);
    const dateB = Number(b.updatedAtMs || b.createdAtMs || 0);

    if (dateA !== dateB) {
      return dateB - dateA;
    }

    return String(a.name || "").localeCompare(String(b.name || ""), "es-MX");
  });
}

function mapClientFromDoc(snapshot) {
  const data = snapshot.data();

  return {
    id: snapshot.id,
    ...data,
    createdAtMs: data.createdAt?.toMillis?.() || 0,
    updatedAtMs: data.updatedAt?.toMillis?.() || 0,
  };
}

function getLegacyClients() {
  return getData(STORAGE_KEYS.CLIENTS, []);
}

async function migrateLegacyClientsIfNeeded() {
  const legacyClients = getLegacyClients();

  if (!legacyClients.length) return;

  const collectionRef = collection(db, COLLECTION_NAME);
  const snapshot = await getDocs(collectionRef);

  if (!snapshot.empty) return;

  await Promise.all(
    legacyClients.map((client) =>
      setDoc(doc(db, COLLECTION_NAME, String(client.id)), {
        name: client.name,
        contact: client.contact,
        email: client.email,
        phone: client.phone,
        status: client.status,
        invoiceRequired: client.invoiceRequired,
        notes: client.notes || "",
        legacyId: client.id,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }),
    ),
  );
}

export function isClientsRemoteEnabled() {
  return Boolean(isFirebaseConfigured && db);
}

export async function getClientsCollection() {
  if (!isClientsRemoteEnabled()) {
    return sortClients(getLegacyClients());
  }

  await migrateLegacyClientsIfNeeded();

  const snapshot = await getDocs(collection(db, COLLECTION_NAME));
  const clients = snapshot.docs.map(mapClientFromDoc);

  saveData(STORAGE_KEYS.CLIENTS, clients);
  return sortClients(clients);
}

export async function saveClientRecord(client) {
  if (!isClientsRemoteEnabled()) {
    const clients = getLegacyClients();

    if (client.id) {
      const exists = clients.some(
        (item) => String(item.id) === String(client.id),
      );
      const updated = exists
        ? clients.map((item) =>
            String(item.id) === String(client.id) ? client : item,
          )
        : [...clients, client];
      saveData(STORAGE_KEYS.CLIENTS, sortClients(updated));
      return client;
    }

    const newClient = { ...client, id: Date.now() };
    clients.push(newClient);
    saveData(STORAGE_KEYS.CLIENTS, sortClients(clients));
    return newClient;
  }

  const payload = {
    name: client.name,
    contact: client.contact,
    email: client.email,
    phone: client.phone,
    status: client.status,
    invoiceRequired: client.invoiceRequired,
    notes: client.notes || "",
    updatedAt: serverTimestamp(),
  };

  if (client.id) {
    await setDoc(doc(db, COLLECTION_NAME, String(client.id)), payload, {
      merge: true,
    });
    const updatedClient = { ...client };
    const cachedClients = getLegacyClients();
    const nextClients = cachedClients.some(
      (item) => String(item.id) === String(client.id),
    )
      ? cachedClients.map((item) =>
          String(item.id) === String(client.id) ? updatedClient : item,
        )
      : [...cachedClients, updatedClient];
    saveData(STORAGE_KEYS.CLIENTS, sortClients(nextClients));
    return updatedClient;
  }

  const docRef = doc(collection(db, COLLECTION_NAME));
  await setDoc(docRef, {
    ...payload,
    createdAt: serverTimestamp(),
  });

  const newClient = { ...client, id: docRef.id };
  saveData(STORAGE_KEYS.CLIENTS, sortClients([...getLegacyClients(), newClient]));
  return newClient;
}

export async function deleteClientRecord(clientId) {
  if (!isClientsRemoteEnabled()) {
    const clients = getLegacyClients().filter(
      (client) => String(client.id) !== String(clientId),
    );
    saveData(STORAGE_KEYS.CLIENTS, clients);
    return;
  }

  await deleteDoc(doc(db, COLLECTION_NAME, String(clientId)));

  const cachedClients = getLegacyClients().filter(
    (client) => String(client.id) !== String(clientId),
  );
  saveData(STORAGE_KEYS.CLIENTS, cachedClients);
}
