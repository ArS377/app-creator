import assert from "node:assert/strict";
import test from "node:test";

import { createCryptoVault, EncryptedCredentialStore } from "../server/crypto-vault.js";
import { MemoryDocumentStore } from "../server/document-store.js";

test("the credential envelope does not contain the OAuth token", async () => {
  const documents = new MemoryDocumentStore();
  const credentials = new EncryptedCredentialStore(
    documents,
    createCryptoVault("a-test-secret-that-is-long-enough")
  );
  await credentials.put("session-one", {
    tokens: { access_token: "replit-access-token", token_type: "bearer" }
  });

  const stored = await documents.get("oauth:session-one", "replit");
  assert.equal(JSON.stringify(stored).includes("replit-access-token"), false);
  assert.equal((await credentials.get("session-one")).tokens.access_token, "replit-access-token");
});

test("encrypted credentials are bound to their browser session", async () => {
  const documents = new MemoryDocumentStore();
  const credentials = new EncryptedCredentialStore(
    documents,
    createCryptoVault("a-test-secret-that-is-long-enough")
  );
  await credentials.put("session-one", { tokens: { access_token: "secret" } });
  const envelope = await documents.get("oauth:session-one", "replit");
  await documents.put("oauth:session-two", "replit", envelope);

  await assert.rejects(() => credentials.get("session-two"));
});

test("legacy credential envelopes migrate to the BluePrinted context", async () => {
  const documents = new MemoryDocumentStore();
  const vault = createCryptoVault("a-test-secret-that-is-long-enough");
  const credentials = new EncryptedCredentialStore(documents, vault);
  const sessionId = "session-one";
  const value = { tokens: { access_token: "legacy-secret" } };
  const legacyEnvelope = vault.seal(value, `living-blueprint:oauth:${sessionId}:replit`);
  await documents.put(`oauth:${sessionId}`, "replit", legacyEnvelope);

  assert.deepEqual(await credentials.get(sessionId), value);
  const migratedEnvelope = await documents.get(`oauth:${sessionId}`, "replit");
  assert.deepEqual(vault.open(migratedEnvelope, `blueprinted:oauth:${sessionId}:replit`), value);
});
