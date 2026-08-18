import assert from "node:assert/strict";
import test from "node:test";

import { getReplay } from "../public/js/replay-model.js";

test("the build replay stays at the level of confirmed milestones", () => {
  const replay = getReplay("build");
  const combinedCopy = replay.steps.map((step) => `${step.title} ${step.detail}`).join(" ");

  assert.equal(replay.label, "Recorded build replay");
  assert.doesNotMatch(combinedCopy, /thinking|reasoning|chain of thought/i);
  assert.deepEqual(replay.steps.at(-1).reveals, ["browser", "api", "database", "stream"]);
});

test("the update replay marks architecture additions explicitly", () => {
  const replay = getReplay("update");
  const finalStep = replay.steps.at(-1);

  assert.equal(replay.label, "Recorded update replay");
  assert.deepEqual(finalStep.added, ["filter", "tags"]);
});

test("unknown replay types are rejected", () => {
  assert.throws(() => getReplay("private-agent-stream"), /Unknown replay/);
});
