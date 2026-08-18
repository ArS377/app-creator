import assert from "node:assert/strict";
import test from "node:test";

import { diffManifests, manifestHash, parseManifestText, validateManifest } from "../lib/manifest.js";

const appId = "c9f5aa03-8f71-4f68-94f4-9c730e7e9291";
const versionId = "fcf5f4a2-7bab-4caa-8e76-12e28011292e";

function manifest() {
  return {
    schemaVersion: "1",
    appId,
    versionId,
    name: "Fieldnotes",
    summary: "A small research notebook.",
    nodes: [
      {
        id: "component:src/App.jsx#save",
        kind: "component",
        label: "Save form",
        evidence: "agent_declared",
        sourceFile: "src/App.jsx",
        metadata: {}
      },
      {
        id: "route:POST:/findings",
        kind: "route",
        label: "Create finding",
        evidence: "agent_declared",
        metadata: { method: "POST" }
      }
    ],
    edges: [
      {
        id: "component:src/App.jsx#save|calls|route:POST:/findings",
        source: "component:src/App.jsx#save",
        target: "route:POST:/findings",
        relationship: "calls",
        evidence: "agent_declared"
      }
    ]
  };
}

test("manifest validation rejects a connection to a missing boundary", () => {
  const candidate = manifest();
  candidate.edges[0].target = "route:POST:/missing";
  assert.throws(() => validateManifest(candidate), /not in the manifest/);
});

test("manifest hashes ignore evidence and source-file changes", () => {
  const before = validateManifest(manifest());
  const afterCandidate = manifest();
  afterCandidate.nodes[0].evidence = "runtime_observed";
  afterCandidate.nodes[0].sourceFile = "src/features/SaveForm.jsx";
  const after = validateManifest(afterCandidate);
  assert.equal(manifestHash(before), manifestHash(after));
});

test("manifest diffs report structural additions", () => {
  const before = validateManifest(manifest());
  const candidate = manifest();
  candidate.nodes.push({
    id: "table:public.findings",
    kind: "table",
    label: "Findings",
    evidence: "agent_declared",
    metadata: {}
  });
  const after = validateManifest(candidate);
  assert.deepEqual(diffManifests(before, after).nodes.added, ["table:public.findings"]);
});

test("manifest parser accepts a fenced JSON response", () => {
  assert.equal(parseManifestText(`\`\`\`json\n${JSON.stringify(manifest())}\n\`\`\``).name, "Fieldnotes");
});
