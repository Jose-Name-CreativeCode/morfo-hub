import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  serverTimestamp,
  setDoc,
  updateDoc,
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
      const updated = clients.map((item) => (item.id === client.id ? client : item));
      saveData(STORAGE_KEYS.CLIENTS, updated);
      return client;
    }

    const newClient = { ...client, id: Date.now() };
    clients.push(newClient);
    saveData(STORAGE_KEYS.CLIENTS, clients);
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
    await updateDoc(doc(db, COLLECTION_NAME, String(client.id)), payload);
    return { ...client };
  }

  const docRef = await addDoc(collection(db, COLLECTION_NAME), {
    ...payload,
    createdAt: serverTimestamp(),
  });

  return { ...client, id: docRef.id };
}

export async function deleteClientRecord(clientId) {
  if (!isClientsRemoteEnabled()) {
    const clients = getLegacyClients().filter((client) => client.id !== clientId);
    saveData(STORAGE_KEYS.CLIENTS, clients);
    return;
  }

  await deleteDoc(doc(db, COLLECTION_NAME, String(clientId)));
}
