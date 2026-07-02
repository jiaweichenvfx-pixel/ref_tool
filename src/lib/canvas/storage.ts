// Blob storage in IndexedDB — stores raw files, returns blob:// URLs
const DB = "cd-files";
const STORE = "blobs";
const BOARDS = "boards";
const V = 2;

function open(): Promise<IDBDatabase> {
  return new Promise((ok, no) => {
    const r = indexedDB.open(DB, V);
    r.onupgradeneeded = () => {
      if (!r.result.objectStoreNames.contains(STORE)) r.result.createObjectStore(STORE);
      if (!r.result.objectStoreNames.contains(BOARDS)) r.result.createObjectStore(BOARDS);
    };
    r.onsuccess = () => ok(r.result);
    r.onerror = () => no(r.error);
  });
}

export async function saveBlob(id: string, blob: Blob): Promise<void> {
  const db = await open();
  return new Promise((ok, no) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(blob, id);
    tx.oncomplete = () => { db.close(); ok(); };
    tx.onerror = () => no(tx.error);
  });
}

export async function loadBlob(id: string): Promise<Blob | null> {
  try {
    const db = await open();
    return new Promise((ok, no) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).get(id);
      req.onsuccess = () => ok(req.result ?? null);
      req.onerror = () => no(req.error);
      tx.oncomplete = () => db.close();
    });
  } catch { return null; }
}

export async function listBlobKeys(): Promise<string[]> {
  try {
    const db = await open();
    return new Promise((ok, no) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).getAllKeys();
      req.onsuccess = () => ok(req.result.map(String));
      req.onerror = () => no(req.error);
      tx.oncomplete = () => db.close();
    });
  } catch {
    return [];
  }
}

export async function deleteBlob(id: string): Promise<void> {
  const db = await open();
  return new Promise((ok, no) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => { db.close(); ok(); };
    tx.onerror = () => no(tx.error);
  });
}

export async function clearBlobs(): Promise<void> {
  const db = await open();
  return new Promise((ok, no) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).clear();
    tx.oncomplete = () => { db.close(); ok(); };
    tx.onerror = () => no(tx.error);
  });
}

export type SavedBoardRecord = {
  id: string;
  name: string;
  savedAt: number;
  nodeCount: number;
  groupCount: number;
  data: string;
};

export async function saveBoardRecord(record: SavedBoardRecord): Promise<void> {
  const db = await open();
  return new Promise((ok, no) => {
    const tx = db.transaction(BOARDS, "readwrite");
    tx.objectStore(BOARDS).put(record, record.id);
    tx.oncomplete = () => { db.close(); ok(); };
    tx.onerror = () => no(tx.error);
  });
}

export async function listBoardRecords(): Promise<SavedBoardRecord[]> {
  try {
    const db = await open();
    return new Promise((ok, no) => {
      const tx = db.transaction(BOARDS, "readonly");
      const req = tx.objectStore(BOARDS).getAll();
      req.onsuccess = () => ok((req.result as SavedBoardRecord[]).sort((a, b) => b.savedAt - a.savedAt));
      req.onerror = () => no(req.error);
      tx.oncomplete = () => db.close();
    });
  } catch {
    return [];
  }
}

export async function loadBoardRecord(id: string): Promise<SavedBoardRecord | null> {
  try {
    const db = await open();
    return new Promise((ok, no) => {
      const tx = db.transaction(BOARDS, "readonly");
      const req = tx.objectStore(BOARDS).get(id);
      req.onsuccess = () => ok(req.result ?? null);
      req.onerror = () => no(req.error);
      tx.oncomplete = () => db.close();
    });
  } catch {
    return null;
  }
}
