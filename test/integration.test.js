import assert from "node:assert/strict";
import test from "node:test";

import { WebSocket } from "ws";

import { createLivingBlueprintServer } from "../server.js";

function fakeReplit() {
  return {
    async status() {
      return { connected: true, connectedAt: "2026-08-18T20:00:00.000Z" };
    },
    async disconnect() {},
    async beginAuthorization() {
      return { connected: true, authorizationUrl: null };
    },
    async finishAuthorization() {
      return { connected: true };
    },
    async callTool(_sessionId, _redirectUrl, name) {
      if (name === "create_app_from_prompt") {
        return { structuredContent: {
          phase: "working",
          replId: "integration-repl",
          replUrl: "https://replit.com/@tester/integration-app",
          turnId: "turn-one"
        } };
      }
      throw new Error(`Unexpected Replit tool: ${name}`);
    }
  };
}

function waitForOpen(socket) {
  return new Promise((resolve, reject) => {
    socket.once("open", resolve);
    socket.once("error", reject);
  });
}

function waitForPacket(socket, type) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timed out waiting for ${type}.`)), 3000);
    socket.on("message", function receive(value) {
      const packet = JSON.parse(value.toString("utf8"));
      if (packet.type !== type) return;
      clearTimeout(timer);
      socket.off("message", receive);
      resolve(packet);
    });
  });
}

test("the HTTP and WebSocket boundary carries a paired runtime event", async (context) => {
  const server = await createLivingBlueprintServer({
    replit: fakeReplit(),
    config: {
      production: false,
      publicOrigin: "",
      sessionSecret: "an-integration-secret-that-is-long-enough",
      databaseUrl: "",
      sourceReplId: ""
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;
  const sockets = [];
  context.after(async () => {
    sockets.forEach((socket) => socket.close());
    await new Promise((resolve) => server.close(resolve));
  });

  const healthResponse = await fetch(`${baseUrl}/api/health`);
  const cookie = healthResponse.headers.get("set-cookie").split(";")[0];
  assert.equal((await healthResponse.json()).status, "ok");

  const createResponse = await fetch(`${baseUrl}/api/projects`, {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({
      name: "Integration app",
      prompt: "Build a small shared notebook for integration testing."
    })
  });
  assert.equal(createResponse.status, 201);
  const { project } = await createResponse.json();

  const pairingResponse = await fetch(`${baseUrl}/api/projects/${project.id}/pairings`, {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ runtimeUrl: "https://runtime.example/app" })
  });
  assert.equal(pairingResponse.status, 201);
  const { pairing } = await pairingResponse.json();

  const exchangeResponse = await fetch(`${baseUrl}/api/runtime/pairings/exchange`, {
    method: "POST",
    headers: { origin: "https://runtime.example", "content-type": "application/json" },
    body: JSON.stringify({ code: pairing.code })
  });
  assert.equal(exchangeResponse.status, 200);
  const exchange = await exchangeResponse.json();

  const viewer = new WebSocket(
    `ws://127.0.0.1:${address.port}/ws/view?projectId=${project.id}`,
    ["lb-view-v1"],
    { headers: { cookie } }
  );
  const ingest = new WebSocket(
    exchange.websocketUrl,
    ["lb-trace-v1", exchange.token],
    { origin: "https://runtime.example" }
  );
  sockets.push(viewer, ingest);
  await Promise.all([waitForOpen(viewer), waitForOpen(ingest)]);

  const observed = waitForPacket(viewer, "trace.event");
  ingest.send(JSON.stringify({
    id: "event-one",
    traceId: "trace-one",
    timestamp: "2026-08-18T20:00:00.000Z",
    durationMs: 21,
    kind: "ui.action",
    nodeId: "component:src/App.jsx#save",
    status: "ok",
    requestBody: "must not survive"
  }));
  const packet = await observed;

  assert.equal(packet.event.projectId, project.id);
  assert.equal(packet.event.nodeId, "component:src/App.jsx#save");
  assert.equal("requestBody" in packet.event, false);

  const tracesResponse = await fetch(`${baseUrl}/api/projects/${project.id}/traces`, {
    headers: { cookie }
  });
  const traceBody = await tracesResponse.json();
  assert.equal(traceBody.traces[0].id, "trace-one");
  assert.equal(traceBody.evidence[0].nodeId, "component:src/App.jsx#save");
});
