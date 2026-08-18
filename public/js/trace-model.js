const successfulEvents = [
  {
    id: "evt-01",
    at: 0,
    node: "browser",
    kind: "interaction",
    title: "Save submitted",
    detail: "The browser accepted the finding and started trace trc-sample.",
    edge: null
  },
  {
    id: "evt-02",
    at: 38,
    node: "api",
    kind: "request",
    title: "Request sent",
    detail: "POST /api/findings reached the Express route.",
    edge: "browser-api"
  },
  {
    id: "evt-03",
    at: 69,
    node: "api",
    kind: "handler",
    title: "Input accepted",
    detail: "The route validated the title and source fields.",
    edge: null
  },
  {
    id: "evt-04",
    at: 112,
    node: "database",
    kind: "database",
    title: "Finding inserted",
    detail: "The database committed one sanitized finding record.",
    edge: "api-database"
  },
  {
    id: "evt-05",
    at: 139,
    node: "stream",
    kind: "telemetry",
    title: "Trace event published",
    detail: "The session-scoped trace stream delivered the database result.",
    edge: "api-stream"
  },
  {
    id: "evt-06",
    at: 178,
    node: "api",
    kind: "response",
    title: "Response returned",
    detail: "The API returned 201 Created to the browser.",
    edge: "browser-api"
  },
  {
    id: "evt-07",
    at: 214,
    node: "browser",
    kind: "render",
    title: "Finding rendered",
    detail: "The browser added the saved finding to the list.",
    edge: "browser-api"
  }
];

const faultedEvents = [
  {
    id: "fault-evt-01",
    at: 0,
    node: "browser",
    kind: "interaction",
    level: "info",
    title: "Save submitted",
    detail: "The browser accepted the finding and started a new trace.",
    edge: null
  },
  {
    id: "fault-evt-02",
    at: 41,
    node: "api",
    kind: "request",
    level: "info",
    title: "Request sent",
    detail: "POST /api/findings reached the Express route.",
    edge: "browser-api"
  },
  {
    id: "fault-evt-03",
    at: 73,
    node: "api",
    kind: "handler",
    level: "info",
    title: "Input accepted",
    detail: "The route validated the title and source fields.",
    edge: null
  },
  {
    id: "fault-evt-04",
    at: 118,
    node: "database",
    kind: "database",
    level: "error",
    title: "Write rejected",
    detail: "Fault Lab rejected the database write before any record was inserted.",
    edge: "api-database"
  },
  {
    id: "fault-evt-05",
    at: 146,
    node: "stream",
    kind: "telemetry",
    level: "info",
    title: "Failure published",
    detail: "The session-scoped trace stream delivered the rejected-write event.",
    edge: "api-stream"
  },
  {
    id: "fault-evt-06",
    at: 184,
    node: "api",
    kind: "response",
    level: "error",
    title: "Error returned",
    detail: "The API returned 503 and did not report a successful save.",
    edge: "browser-api"
  },
  {
    id: "fault-evt-07",
    at: 221,
    node: "browser",
    kind: "render",
    level: "error",
    title: "Save failed visibly",
    detail: "The browser kept the form intact and showed that the finding was not saved.",
    edge: "browser-api"
  }
];

export function createSuccessfulTrace() {
  return {
    id: `trc-${Date.now().toString(36)}`,
    status: "success",
    duration: successfulEvents.at(-1).at,
    events: successfulEvents.map((event) => ({ ...event }))
  };
}

export function createFaultedTrace() {
  return {
    id: `trc-${Date.now().toString(36)}`,
    status: "error",
    fault: "reject-database-write",
    duration: faultedEvents.at(-1).at,
    events: faultedEvents.map((event) => ({ ...event }))
  };
}

export function formatMilliseconds(value) {
  return `${Math.round(value)} ms`;
}
