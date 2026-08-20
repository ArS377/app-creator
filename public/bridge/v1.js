const allowedEventKeys = [
  "id",
  "traceId",
  "parentId",
  "timestamp",
  "durationMs",
  "kind",
  "nodeId",
  "routeTemplate",
  "operation",
  "status",
  "errorClass"
];

function randomId(prefix) {
  return `${prefix}:${crypto.randomUUID()}`;
}

function allowlistedEvent(event) {
  return Object.fromEntries(allowedEventKeys
    .filter((key) => event[key] !== undefined)
    .map((key) => [key, event[key]]));
}

export function createBluePrintedBridge(options) {
  const controlOrigin = new URL(options.controlOrigin).origin;
  let socket = null;
  let pairingPromise = null;

  async function exchange(code) {
    const response = await fetch(`${controlOrigin}/api/runtime/pairings/exchange`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code })
    });
    if (!response.ok) throw new Error("BluePrinted pairing failed.");
    const pairing = await response.json();
    socket = new WebSocket(pairing.websocketUrl, ["lb-trace-v1", pairing.token]);
    await new Promise((resolve, reject) => {
      socket.addEventListener("open", resolve, { once: true });
      socket.addEventListener("error", reject, { once: true });
    });
    window.parent?.postMessage({ type: "lb.connected", projectId: options.projectId }, controlOrigin);
    window.opener?.postMessage({ type: "lb.connected", projectId: options.projectId }, controlOrigin);
  }

  function receivePairing(event) {
    if (event.origin !== controlOrigin || event.data?.type !== "lb.pair") return;
    if (event.data.projectId !== options.projectId || typeof event.data.code !== "string") return;
    pairingPromise ||= exchange(event.data.code).catch((error) => {
      pairingPromise = null;
      throw error;
    });
  }

  window.addEventListener("message", receivePairing);
  const ready = { type: "lb.ready", projectId: options.projectId };
  window.parent?.postMessage(ready, controlOrigin);
  window.opener?.postMessage(ready, controlOrigin);

  return {
    async connected() {
      return pairingPromise;
    },

    emit(candidate) {
      if (!socket || socket.readyState !== WebSocket.OPEN) return false;
      socket.send(JSON.stringify(allowlistedEvent({
        id: candidate.id || randomId("event"),
        traceId: candidate.traceId || randomId("trace"),
        timestamp: candidate.timestamp || new Date().toISOString(),
        durationMs: candidate.durationMs || 0,
        ...candidate
      })));
      return true;
    },

    async action(nodeId, callback) {
      const traceId = randomId("trace");
      const id = randomId("event");
      const started = performance.now();
      try {
        const result = await callback({ traceId, parentId: id });
        this.emit({ id, traceId, kind: "ui.action", nodeId, durationMs: performance.now() - started, status: "ok" });
        return result;
      } catch (error) {
        this.emit({ id, traceId, kind: "error", nodeId, durationMs: performance.now() - started, status: "error", errorClass: error?.name || "Error" });
        throw error;
      }
    },

    close() {
      window.removeEventListener("message", receivePairing);
      socket?.close();
    }
  };
}
