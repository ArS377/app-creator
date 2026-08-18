import assert from "node:assert/strict";
import test from "node:test";

import { MemoryDocumentStore } from "../server/document-store.js";

test("memory documents are isolated by namespace", async () => {
  const store = new MemoryDocumentStore();
  await store.put("projects:first", "shared", { name: "One" });
  await store.put("projects:second", "shared", { name: "Two" });

  assert.deepEqual(await store.get("projects:first", "shared"), { name: "One" });
  assert.deepEqual(await store.get("projects:second", "shared"), { name: "Two" });
});

test("expired documents disappear before they are returned", async () => {
  let now = 100;
  const store = new MemoryDocumentStore({ now: () => now });
  await store.put("pairings", "code", { used: false }, { expiresAt: 150 });

  assert.deepEqual(await store.get("pairings", "code"), { used: false });
  now = 151;
  assert.equal(await store.get("pairings", "code"), null);
});

test("returned documents cannot mutate the stored value", async () => {
  const store = new MemoryDocumentStore();
  await store.put("manifests", "one", { nodes: [{ id: "route:GET:/" }] });
  const result = await store.get("manifests", "one");
  result.nodes[0].id = "changed";

  assert.equal((await store.get("manifests", "one")).nodes[0].id, "route:GET:/");
});

test("taking a document returns it once", async () => {
  const store = new MemoryDocumentStore();
  await store.put("pairings", "one", { projectId: "project" });

  assert.deepEqual(await store.take("pairings", "one"), { projectId: "project" });
  assert.equal(await store.take("pairings", "one"), null);
});
