import assert from "node:assert/strict";
import test from "node:test";

import {
  buildFallbackDiagnosis,
  sanitizeTrace,
  validateDiagnosis
} from "../lib/investigator.js";
import { createFaultedTrace } from "../public/js/trace-model.js";

test("the local investigator cites real fault events", () => {
  const trace = createFaultedTrace();
  const diagnosis = buildFallbackDiagnosis(trace);
  const eventIds = new Set(trace.events.map((event) => event.id));

  assert.equal(diagnosis.firstAbnormalEventId, "fault-evt-04");
  assert.ok(diagnosis.evidence.every((item) => eventIds.has(item.eventId)));
});

test("model output is rejected when its evidence IDs do not exist", () => {
  const trace = createFaultedTrace();
  const diagnosis = buildFallbackDiagnosis(trace);

  diagnosis.evidence[0].eventId = "invented-event";
  assert.equal(validateDiagnosis(diagnosis, trace), null);
});

test("trace sanitization drops unapproved fields", () => {
  const trace = createFaultedTrace();
  trace.events[0].authorization = "secret";
  trace.events[0].rawFormValue = "private";

  const sanitized = sanitizeTrace(trace);
  assert.equal("authorization" in sanitized.events[0], false);
  assert.equal("rawFormValue" in sanitized.events[0], false);
});
