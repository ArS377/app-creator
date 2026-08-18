import assert from "node:assert/strict";
import test from "node:test";

import {
  createFaultedTrace,
  createSuccessfulTrace,
  formatMilliseconds
} from "../public/js/trace-model.js";

test("a successful trace follows the observed system path", () => {
  const trace = createSuccessfulTrace();

  assert.equal(trace.status, "success");
  assert.deepEqual(
    trace.events.map((event) => event.node),
    ["browser", "api", "api", "database", "stream", "api", "browser"]
  );
  assert.equal(trace.duration, trace.events.at(-1).at);
});

test("each trace owns a separate event collection", () => {
  const firstTrace = createSuccessfulTrace();
  const secondTrace = createSuccessfulTrace();

  firstTrace.events[0].title = "Changed locally";
  assert.equal(secondTrace.events[0].title, "Save submitted");
});

test("milliseconds are shown as a compact measurement", () => {
  assert.equal(formatMilliseconds(38.4), "38 ms");
});

test("a faulted trace exposes its first error at the database boundary", () => {
  const trace = createFaultedTrace();
  const firstError = trace.events.find((event) => event.level === "error");

  assert.equal(trace.status, "error");
  assert.equal(trace.fault, "reject-database-write");
  assert.equal(firstError.id, "fault-evt-04");
  assert.equal(firstError.node, "database");
});
