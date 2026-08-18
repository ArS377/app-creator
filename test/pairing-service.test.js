import assert from "node:assert/strict";
import test from "node:test";

import { MemoryDocumentStore } from "../server/document-store.js";
import { PairingService } from "../server/pairing-service.js";
import { ProjectRepository } from "../server/project-repository.js";
import { createSignedTokenService } from "../server/signed-token.js";

async function setup() {
  let now = 1_800_000_000_000;
  const documents = new MemoryDocumentStore({ now: () => now });
  const repository = new ProjectRepository(documents);
  await repository.save("session", {
    id: "project-one",
    currentVersionId: "version-one",
    runtimeUrl: "https://fieldnotes.replit.app/path",
    updatedAt: new Date(now).toISOString()
  });
  const service = new PairingService({
    documentStore: documents,
    repository,
    tokens: createSignedTokenService("a-test-secret-that-is-long-enough", { now: () => now }),
    now: () => now
  });
  return { service, advance: (milliseconds) => { now += milliseconds; } };
}

test("a pairing exchanges once for an origin-bound trace token", async () => {
  const { service } = await setup();
  const pairing = await service.issue("session", "project-one", "https://fieldnotes.replit.app/");
  const exchanged = await service.exchange(pairing.code, "https://fieldnotes.replit.app");
  const claims = await service.verify(exchanged.token, "https://fieldnotes.replit.app");

  assert.equal(claims.projectId, "project-one");
  assert.equal(claims.scope, "trace:write");
  await assert.rejects(() => service.exchange(pairing.code, "https://fieldnotes.replit.app"), /already used/);
});

test("a pairing rejects a different runtime origin", async () => {
  const { service } = await setup();
  const pairing = await service.issue("session", "project-one", "https://fieldnotes.replit.app/");
  await assert.rejects(() => service.exchange(pairing.code, "https://attacker.example"), /does not match/);
});

test("an issued trace token expires", async () => {
  const { service, advance } = await setup();
  const pairing = await service.issue("session", "project-one", "https://fieldnotes.replit.app/");
  const exchanged = await service.exchange(pairing.code, "https://fieldnotes.replit.app");
  advance(31 * 60 * 1000);
  assert.throws(() => service.tokens.verify(exchanged.token), /expired/);
});
