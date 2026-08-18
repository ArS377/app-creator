import assert from "node:assert/strict";
import test from "node:test";

import { UnauthorizedError } from "@modelcontextprotocol/sdk/client/auth.js";

import { createCryptoVault, EncryptedCredentialStore } from "../server/crypto-vault.js";
import { MemoryDocumentStore } from "../server/document-store.js";
import { ReplitMcpService } from "../server/replit-mcp.js";

function createCredentials() {
  return new EncryptedCredentialStore(
    new MemoryDocumentStore(),
    createCryptoVault("a-test-secret-that-is-long-enough")
  );
}

test("authorization stores state and returns the provider redirect", async () => {
  const credentials = createCredentials();
  let provider;
  const service = new ReplitMcpService({
    credentials,
    transportFactory: (value) => {
      provider = value;
      return {};
    },
    clientFactory: () => ({
      async connect() {
        await provider.redirectToAuthorization(
          new URL(`https://replit.com/oauth?state=${await provider.state()}`)
        );
        throw new UnauthorizedError();
      },
      async close() {}
    })
  });

  const result = await service.beginAuthorization(
    "session-one",
    "https://blueprint.example/auth/replit/callback"
  );
  const record = await credentials.get("session-one");

  assert.equal(result.connected, false);
  assert.match(result.authorizationUrl, /^https:\/\/replit\.com\/oauth/);
  assert.equal(record.state.length >= 32, true);
});

test("the callback rejects state from another browser", async () => {
  const credentials = createCredentials();
  await credentials.put("session-one", { state: "expected" });
  const service = new ReplitMcpService({
    credentials,
    transportFactory: () => ({}),
    clientFactory: () => ({ async close() {} })
  });

  await assert.rejects(
    () => service.finishAuthorization("session-one", "https://example.com/callback", {
      code: "code",
      state: "wrong"
    }),
    /did not match/
  );
});

test("disconnect removes every saved Replit credential", async () => {
  const credentials = createCredentials();
  await credentials.put("session-one", { tokens: { access_token: "secret" } });
  const service = new ReplitMcpService({
    credentials,
    transportFactory: () => ({}),
    clientFactory: () => ({ async close() {} })
  });

  await service.disconnect("session-one");
  assert.deepEqual(await service.status("session-one"), {
    connected: false,
    connectedAt: null
  });
});
