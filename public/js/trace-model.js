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

export function createSuccessfulTrace() {
  return {
    id: `trc-${Date.now().toString(36)}`,
    status: "success",
    duration: successfulEvents.at(-1).at,
    events: successfulEvents.map((event) => ({ ...event }))
  };
}

export function formatMilliseconds(value) {
  return `${Math.round(value)} ms`;
}
