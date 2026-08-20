import assert from "node:assert/strict";
import test from "node:test";

import { loadRuntimeConfig } from "../server/config.js";

test("local development receives a non-production secret", () => {
  const config = loadRuntimeConfig({});
  assert.equal(config.production, false);
  assert.equal(config.sessionSecret.length >= 16, true);
});

test("production refuses to start without durable encrypted state", () => {
  assert.throws(
    () => loadRuntimeConfig({ NODE_ENV: "production" }),
    /SESSION_SECRET, DATABASE_URL, PUBLIC_ORIGIN or REPLIT_DOMAINS/
  );
});

test("a Replit deployment domain supplies the public origin", () => {
  const config = loadRuntimeConfig({
    REPLIT_DEPLOYMENT: "1",
    REPLIT_DOMAINS: "blueprinted.replit.app",
    SESSION_SECRET: "a-production-secret-that-is-long-enough",
    DATABASE_URL: "postgres://example"
  });
  assert.equal(config.publicOrigin, "https://blueprinted.replit.app");
});
