import type { FileFingerprint, SidecarManifest } from "@robotscope/core";
import { parseSidecarManifest, serializeSidecarManifest } from "@robotscope/core";

const DB_NAME = "robotscope-sidecar-v1";
const STORE_NAME = "sidecars";

function cacheKey(fingerprint: FileFingerprint): string {
  return `${fingerprint.name}:${fingerprint.size}:${fingerprint.last_modified_ms ?? 0}`;
}

export function fileFingerprint(file: File): FileFingerprint {
  return {
    name: file.name,
    size: file.size,
    last_modified_ms: file.lastModified,
  };
}

export function folderBagFingerprint(metadataFile: File, files: File[]): FileFingerprint {
  const totalSize = files.reduce((sum, entry) => sum + entry.size, 0);
  const lastModified = Math.max(...files.map((entry) => entry.lastModified));
  return {
    name: metadataFile.name,
    size: totalSize,
    last_modified_ms: lastModified,
  };
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function loadSidecarFromCache(
  fingerprint: FileFingerprint,
): Promise<SidecarManifest | null> {
  if (typeof indexedDB === "undefined") {
    return null;
  }

  let db: IDBDatabase;
  try { db = await openDb(); } catch { return null; }
  try {
    return await new Promise<SidecarManifest | null>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const request = store.get(cacheKey(fingerprint));
      request.onsuccess = () => {
        const raw = request.result;
        if (typeof raw !== "string") {
          resolve(null);
          return;
        }
        resolve(parseSidecarManifest(raw));
      };
      request.onerror = () => reject(request.error);
    });
  } catch {
    // Browser storage is an optional acceleration, never a playback prerequisite.
    return null;
  } finally {
    db.close();
  }
}

export async function saveSidecarToCache(
  fingerprint: FileFingerprint,
  manifest: SidecarManifest,
): Promise<void> {
  if (typeof indexedDB === "undefined") {
    return;
  }

  let db: IDBDatabase;
  try { db = await openDb(); } catch { return; }
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      store.put(serializeSidecarManifest(manifest), cacheKey(fingerprint));
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error ?? new Error("Sidecar cache write aborted"));
    });
  } catch {
    // Quota limits or private browsing must not prevent opening a recording.
  } finally {
    db.close();
  }
}
