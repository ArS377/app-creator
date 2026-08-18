import assert from "node:assert/strict";
import test from "node:test";

import { createSessionStore, parseCookies } from "../server.js";

test("cookie parsing handles a session among unrelated values", () => {
  assert.deepEqual(parseCookies("theme=paper; living_blueprint_session=abc123; seen=yes"), {
    theme: "paper",
    living_blueprint_session: "abc123",
    seen: "yes"
  });
});

test("anonymous sessions are isolated and reusable", () => {
  let currentTime = 1000;
  const store = createSessionStore({ now: () => currentTime });
  const first = store.ensure();
  const second = store.ensure();
  const repeated = store.ensure(`living_blueprint_session=${first.id}`);

  assert.notEqual(first.id, second.id);
  assert.equal(repeated.id, first.id);
  assert.equal(repeated.isNew, false);
  assert.equal(store.size, 2);
});

test("investigator limits apply to one session without affecting another", () => {
  const store = createSessionStore({ rateLimit: 2 });
  const first = store.ensure();
  const second = store.ensure();

  assert.equal(store.consumeInvestigatorCall(first.id), true);
  assert.equal(store.consumeInvestigatorCall(first.id), true);
  assert.equal(store.consumeInvestigatorCall(first.id), false);
  assert.equal(store.consumeInvestigatorCall(second.id), true);
});

test("expired sessions are removed", () => {
  let currentTime = 1000;
  const store = createSessionStore({ ttlMs: 500, now: () => currentTime });
  store.ensure();
  currentTime = 1501;
  store.prune();

  assert.equal(store.size, 0);
});
