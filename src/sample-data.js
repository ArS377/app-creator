export const sampleProject = {
  id: "sample",
  name: "Research desk",
  prompt: "Build a research desk where I can save useful articles with a note and source link.",
  status: "observable",
  sourceMode: "prepared_sample",
  manifestStatus: "valid",
  pairingStatus: "connected",
  currentVersionId: "sample-version",
  milestones: [
    { type: "create_requested", detail: "Creation request sent to Replit.", at: "10:14:03" },
    { type: "repl_created", detail: "Replit returned the project editor URL.", at: "10:14:08" },
    { type: "manifest_valid", detail: "Four runtime boundaries validated.", at: "10:16:42" },
    { type: "published", detail: "Replit returned the live app URL.", at: "10:17:11" }
  ]
};

export const sampleManifest = {
  schemaVersion: "1",
  appId: "e2f72366-f342-4d56-9e71-468459d83df1",
  versionId: "a36b1514-ad3f-4f3a-a148-b67fb36277f0",
  name: "Fieldnotes",
  summary: "A research desk that saves notes and sources.",
  nodes: [
    { id: "component:FindingEditor#save", kind: "component", label: "Save form", evidence: "runtime_observed", metadata: { action: "save" } },
    { id: "route:POST:/findings", kind: "route", label: "Create finding", evidence: "runtime_observed", metadata: { method: "POST" } },
    { id: "table:public.findings", kind: "table", label: "Findings", evidence: "runtime_observed", metadata: { operation: "insert" } },
    { id: "websocket:trace-events", kind: "websocket", label: "Trace stream", evidence: "runtime_observed", metadata: { channel: "events" } }
  ],
  edges: [
    { id: "save|calls|route", source: "component:FindingEditor#save", target: "route:POST:/findings", relationship: "calls", evidence: "runtime_observed" },
    { id: "route|writes|findings", source: "route:POST:/findings", target: "table:public.findings", relationship: "writes", evidence: "runtime_observed" },
    { id: "route|publishes|trace", source: "route:POST:/findings", target: "websocket:trace-events", relationship: "publishes", evidence: "runtime_observed" }
  ]
};

const successEvents = [
  { id: "sample-01", traceId: "sample-success", at: 0, timestamp: "10:18:22.004", node: "component:FindingEditor#save", nodeId: "component:FindingEditor#save", kind: "ui.action", level: "info", title: "Save clicked", detail: "The browser started a traced save." },
  { id: "sample-02", traceId: "sample-success", at: 34, timestamp: "10:18:22.038", node: "route:POST:/findings", nodeId: "route:POST:/findings", kind: "http.server", level: "info", title: "Route accepted", detail: "POST /findings passed validation." },
  { id: "sample-03", traceId: "sample-success", at: 91, timestamp: "10:18:22.095", node: "table:public.findings", nodeId: "table:public.findings", kind: "db.query", level: "info", title: "Finding inserted", detail: "The database committed one row." },
  { id: "sample-04", traceId: "sample-success", at: 118, timestamp: "10:18:22.122", node: "websocket:trace-events", nodeId: "websocket:trace-events", kind: "ws.publish", level: "info", title: "Update broadcast", detail: "The live list received the saved finding." }
];

const faultEvents = [
  { ...successEvents[0], id: "fault-evt-01", traceId: "sample-fault", timestamp: "10:19:10.014" },
  { ...successEvents[1], id: "fault-evt-02", traceId: "sample-fault", timestamp: "10:19:10.048" },
  { id: "fault-evt-03", traceId: "sample-fault", at: 79, timestamp: "10:19:10.093", node: "table:public.findings", nodeId: "table:public.findings", kind: "fault.applied", level: "info", title: "Test fault applied", detail: "Fault Lab rejected this session's next write." },
  { id: "fault-evt-04", traceId: "sample-fault", at: 84, timestamp: "10:19:10.098", node: "table:public.findings", nodeId: "table:public.findings", kind: "error", level: "error", title: "Write rejected", detail: "The database adapter returned the labeled test error." },
  { id: "fault-evt-05", traceId: "sample-fault", at: 105, timestamp: "10:19:10.119", node: "api", nodeId: "route:POST:/findings", kind: "http.server", level: "error", title: "Route returned 503", detail: "The API kept the failed write out of storage." },
  { id: "fault-evt-06", traceId: "sample-fault", at: 126, timestamp: "10:19:10.140", node: "browser", nodeId: "component:FindingEditor#save", kind: "ui.action", level: "error", title: "Form kept its draft", detail: "The browser showed the failure without clearing the form." }
];

export function sampleTrace(fault = false) {
  const events = fault ? faultEvents : successEvents;
  return {
    id: fault ? "sample-fault" : "sample-success",
    status: fault ? "error" : "success",
    fault: fault ? "reject_database_write" : null,
    duration: events.at(-1).at,
    events: events.map((event) => ({ ...event }))
  };
}

export const promptExamples = [
  "Build a local event planner where friends vote on dates and places.",
  "Build a visual reading journal that maps themes across books.",
  "Build a studio inventory that tracks borrowed gear and return dates."
];
