import { WebSocket, WebSocketServer } from "ws";

import { parseCookies, sessionCookieName } from "./session-store.js";

function protocols(request) {
  return String(request.headers["sec-websocket-protocol"] || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

export class TraceHub {
  constructor() {
    this.viewers = new Map();
  }

  add(projectId, socket) {
    const viewers = this.viewers.get(projectId) || new Set();
    viewers.add(socket);
    this.viewers.set(projectId, viewers);
    socket.on("close", () => {
      viewers.delete(socket);
      if (!viewers.size) this.viewers.delete(projectId);
    });
  }

  broadcast(projectId, event) {
    for (const socket of this.viewers.get(projectId) || []) {
      if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: "trace.event", event }));
    }
  }
}

export function attachTraceWebSocket(server, options) {
  const hub = options.hub || new TraceHub();
  const webSockets = new WebSocketServer({
    noServer: true,
    handleProtocols(values) {
      if (values.has("lb-trace-v1")) return "lb-trace-v1";
      if (values.has("lb-view-v1")) return "lb-view-v1";
      return false;
    }
  });

  server.on("upgrade", async (request, socket, head) => {
    try {
      const url = new URL(request.url || "/", "http://living-blueprint.local");
      if (url.pathname !== "/ws/traces" && url.pathname !== "/ws/view") return;

      let context;
      if (url.pathname === "/ws/traces") {
        const submitted = protocols(request);
        const token = submitted.find((value) => value !== "lb-trace-v1");
        const origin = String(request.headers.origin || "");
        const claims = await options.pairings.verify(token, origin);
        context = { mode: "ingest", claims };
      } else {
        const sessionId = parseCookies(request.headers.cookie || "")[sessionCookieName];
        const projectId = String(url.searchParams.get("projectId") || "");
        if (!sessionId || !(await options.repository.get(sessionId, projectId))) {
          throw new Error("This browser cannot view the requested project.");
        }
        context = { mode: "view", projectId };
      }

      webSockets.handleUpgrade(request, socket, head, (webSocket) => {
        webSockets.emit("connection", webSocket, request, context);
      });
    } catch {
      socket.write("HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n");
      socket.destroy();
    }
  });

  webSockets.on("connection", (socket, _request, context) => {
    if (context.mode === "view") {
      hub.add(context.projectId, socket);
      socket.send(JSON.stringify({ type: "viewer.ready", projectId: context.projectId }));
      return;
    }

    socket.send(JSON.stringify({ type: "ingest.ready", projectId: context.claims.projectId }));
    socket.on("message", async (data) => {
      try {
        const raw = data.toString("utf8");
        const event = await options.traces.append(JSON.parse(raw), context.claims, Buffer.byteLength(raw));
        hub.broadcast(context.claims.projectId, event);
        socket.send(JSON.stringify({ type: "event.accepted", eventId: event.id }));
      } catch (error) {
        socket.send(JSON.stringify({ type: "event.rejected", error: error.message }));
      }
    });
  });

  return { hub, webSockets };
}
