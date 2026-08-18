import assert from "node:assert/strict";
import test from "node:test";

import { createSuccessfulTrace, formatMilliseconds } from "../public/js/trace-model.js";

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
