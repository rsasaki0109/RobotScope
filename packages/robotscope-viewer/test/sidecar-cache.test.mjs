import assert from "node:assert/strict";
import test from "node:test";
import { loadSidecarFromCache, saveSidecarToCache } from "../src/storage/sidecar-cache.ts";

test("unavailable IndexedDB never blocks recording playback or saving", async () => {
  const original = globalThis.indexedDB;
  globalThis.indexedDB = { open() { throw new Error("Browser storage disabled"); } };
  try {
    assert.equal(await loadSidecarFromCache({ name: "test.mcap", size: 10 }), null);
    await saveSidecarToCache({ name: "test.mcap", size: 10 }, {});
  } finally {
    if (original === undefined) delete globalThis.indexedDB;
    else globalThis.indexedDB = original;
  }
});

test("an aborted cache transaction completes as an optional-cache failure", async () => {
  const original = globalThis.indexedDB;
  let closed = false;
  globalThis.indexedDB = {
    open() {
      const request = {};
      queueMicrotask(() => {
        request.result = {
          transaction() {
            const tx = { objectStore: () => ({ put() {} }), error: new Error("Quota exceeded") };
            queueMicrotask(() => tx.onabort());
            return tx;
          },
          close() { closed = true; },
        };
        request.onsuccess();
      });
      return request;
    },
  };
  try {
    await saveSidecarToCache({ name: "test.mcap", size: 10 }, {});
    assert.equal(closed, true);
  } finally {
    if (original === undefined) delete globalThis.indexedDB;
    else globalThis.indexedDB = original;
  }
});
