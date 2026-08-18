import assert from "node:assert/strict";
import test from "node:test";

import { MemoryDocumentStore } from "../server/document-store.js";
import { ProjectRepository } from "../server/project-repository.js";
import { ProjectService } from "../server/project-service.js";

function fakeReplit() {
  const calls = [];
  return {
    calls,
    async callTool(_sessionId, _redirectUrl, name, argumentsValue) {
      calls.push({ name, argumentsValue });
      if (name === "create_app_from_prompt") {
        return { structuredContent: {
          phase: "working",
          replId: "repl-one",
          replUrl: "https://replit.com/@person/app",
          turnId: "turn-one"
        } };
      }
      if (name === "ask_question") {
        const appId = argumentsValue.question.match(/"appId": "([^"]+)/)[1];
        const versionId = argumentsValue.question.match(/"versionId": "([^"]+)/)[1];
        return { content: [{ type: "text", text: JSON.stringify({
          schemaVersion: "1",
          appId,
          versionId,
          name: "Fieldnotes",
          summary: "A small research notebook.",
          nodes: [{
            id: "component:src/App.jsx#save",
            kind: "component",
            label: "Save form",
            evidence: "agent_declared",
            sourceFile: "src/App.jsx",
            metadata: {}
          }],
          edges: []
        }) }] };
      }
      if (name === "publish_app") return { structuredContent: { phase: "publishing" } };
      if (name === "get_publish_status") {
        return { structuredContent: { status: "published", publishedUrl: "https://fieldnotes.replit.app" } };
      }
      return { structuredContent: { phase: "working", turnId: "turn-two" } };
    }
  };
}

test("creation uses the source Repl and records the returned project", async () => {
  const replit = fakeReplit();
  const repository = new ProjectRepository(new MemoryDocumentStore());
  const service = new ProjectService({ repository, replit, sourceReplId: "source-repl" });
  const project = await service.create("session", "https://example.com/callback", {
    name: "Fieldnotes",
    prompt: "Build a research notebook where I can save useful findings."
  });

  assert.equal(project.replId, "repl-one");
  assert.equal(project.status, "agent_working");
  assert.equal(replit.calls[0].argumentsValue.sourceReplId, "source-repl");
  assert.equal(replit.calls[0].argumentsValue.app_stack, "react_website");
});

test("inspection stores a strict manifest snapshot", async () => {
  const replit = fakeReplit();
  const repository = new ProjectRepository(new MemoryDocumentStore());
  const service = new ProjectService({ repository, replit });
  const created = await service.create("session", "https://example.com/callback", {
    name: "Fieldnotes",
    prompt: "Build a research notebook where I can save useful findings."
  });
  const inspected = await service.inspect("session", "https://example.com/callback", created.id);
  const detail = await service.detail("session", created.id);

  assert.equal(inspected.manifestStatus, "valid");
  assert.equal(detail.currentManifest.manifest.nodes[0].id, "component:src/App.jsx#save");
  assert.equal(detail.currentManifest.hash.length, 64);
});

test("publication status records only the runtime URL returned by Replit", async () => {
  const replit = fakeReplit();
  const repository = new ProjectRepository(new MemoryDocumentStore());
  const service = new ProjectService({ repository, replit });
  const created = await service.create("session", "https://example.com/callback", {
    name: "Fieldnotes",
    prompt: "Build a research notebook where I can save useful findings."
  });
  const published = await service.publish("session", "https://example.com/callback", created.id);

  assert.equal(published.status, "published");
  assert.equal(published.runtimeUrl, "https://fieldnotes.replit.app");
  assert.deepEqual(replit.calls.slice(-2).map((call) => call.name), ["publish_app", "get_publish_status"]);
});
