import assert from "node:assert/strict";
import test from "node:test";

import { MemoryDocumentStore } from "../server/document-store.js";
import { sanitizeRuntimeEvent, TraceStore } from "../server/trace-store.js";

const claims = {
  jti: "token-one",
  projectId: "project-one",
  versionId: "version-one"
};

function event() {
  return {
    id: "event-one",
    traceId: "trace-one",
    timestamp: "2026-08-18T20:00:00.000Z",
    durationMs: 18.239,
    kind: "http.client",
    nodeId: "route:POST:/findings",
    routeTemplate: "/users/23232/findings?token=secret",
    operation: "POST",
    status: "200",
    authorization: "Bearer secret",
    requestBody: { private: true }
  };
}

test("runtime sanitation drops unknown values and normalizes routes", () => {
  const sanitized = sanitizeRuntimeEvent(event(), claims);
  assert.equal(sanitized.routeTemplate, "/users/:id/findings");
  assert.equal(sanitized.durationMs, 18.24);
  assert.equal("authorization" in sanitized, false);
  assert.equal("requestBody" in sanitized, false);
});

test("trace storage is idempotent and records observed evidence", async () => {
  const documents = new MemoryDocumentStore();
  const traces = new TraceStore({ documentStore: documents });
  await traces.append(event(), claims, 500);
  await traces.append(event(), claims, 500);

  const detail = await traces.detail("project-one", "trace-one");
  const evidence = await traces.evidence("project-one", "version-one");
  assert.equal(detail.events.length, 1);
  assert.equal(detail.eventCount, 1);
  assert.equal(evidence[0].nodeId, "route:POST:/findings");
});

test("trace storage rejects events larger than four kilobytes", async () => {
  const traces = new TraceStore({ documentStore: new MemoryDocumentStore() });
  await assert.rejects(() => traces.append(event(), claims, 4097), /4 KB/);
});
