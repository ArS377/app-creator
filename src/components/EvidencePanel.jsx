import { useMemo, useState } from "react";

function eventTime(event, first) {
  if (Number.isFinite(event.at)) return `${event.at} ms`;
  const at = new Date(event.timestamp).getTime();
  const start = new Date(first.timestamp).getTime();
  return Number.isFinite(at - start) ? `${Math.max(0, at - start)} ms` : "now";
}

function eventTitle(event) {
  if (event.title) return event.title;
  return {
    "ui.action": "Interface action",
    "http.client": "Browser request",
    "http.server": "Route handled",
    "db.query": "Database operation",
    "ai.call": "Model call",
    "ws.publish": "Message sent",
    "ws.receive": "Message received",
    "fault.applied": "Test fault applied",
    error: "Error observed"
  }[event.kind] || event.kind;
}

export function EvidencePanel({
  project,
  traces,
  activeTrace,
  activeEventId,
  onTrace,
  onEvent,
  diagnosis,
  diagnosisBusy,
  onInvestigate,
  live
}) {
  const [section, setSection] = useState("trace");
  const events = activeTrace?.events || [];
  const first = events[0] || {};
  const firstError = useMemo(() => events.find((event) => event.kind === "error" || event.level === "error"), [events]);

  return (
    <aside className="evidence-panel">
      <header className="evidence-head">
        <div>
          <span className="eyebrow">Evidence</span>
          <h2>{section === "trace" ? "Runtime trace" : "Build record"}</h2>
        </div>
        <span className={`live-signal ${live ? "is-live" : ""}`}>
          <i></i>{live ? "listening" : "stored"}
        </span>
      </header>

      <div className="evidence-tabs" role="tablist">
        <button className={section === "trace" ? "is-active" : ""} onClick={() => setSection("trace")} type="button">
          Trace <span>{events.length}</span>
        </button>
        <button className={section === "build" ? "is-active" : ""} onClick={() => setSection("build")} type="button">
          Build <span>{project.milestones?.length || 0}</span>
        </button>
      </div>

      {section === "build" ? (
        <ol className="build-ledger">
          {(project.milestones || []).map((item, index) => (
            <li key={`${item.type}-${index}`}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              <div>
                <strong>{item.type.replaceAll("_", " ")}</strong>
                <p>{item.detail}</p>
              </div>
              <time>{item.at?.includes("T") ? new Date(item.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : item.at}</time>
            </li>
          ))}
        </ol>
      ) : (
        <>
          {traces.length > 1 && (
            <label className="trace-select">
              Trace
              <select value={activeTrace?.id || ""} onChange={(event) => onTrace(event.target.value)}>
                {traces.map((trace) => <option value={trace.id} key={trace.id}>{trace.id}</option>)}
              </select>
            </label>
          )}
          {events.length ? (
            <ol className="trace-ledger">
              {events.map((event, index) => {
                const error = event.kind === "error" || event.level === "error";
                return (
                  <li className={`${event.id === activeEventId ? "is-active" : ""} ${error ? "is-error" : ""}`} key={event.id}>
                    <button type="button" onClick={() => onEvent(event)}>
                      <span className="event-index">{String(index + 1).padStart(2, "0")}</span>
                      <span className="event-copy">
                        <strong>{eventTitle(event)}</strong>
                        <small>{event.nodeId || event.node}</small>
                      </span>
                      <time>{eventTime(event, first)}</time>
                    </button>
                  </li>
                );
              })}
            </ol>
          ) : (
            <div className="trace-empty">
              <span>···</span>
              <strong>No runtime evidence yet</strong>
              <p>Pair the published app, then use it normally. Its first traced action will appear here.</p>
            </div>
          )}

          {events.length > 0 && (
            <section className="investigator-result">
              <header>
                <span className="eyebrow">Investigator</span>
                <button type="button" onClick={onInvestigate} disabled={diagnosisBusy}>
                  {diagnosisBusy ? "Reading trace" : diagnosis ? "Check again" : "Explain this trace"}
                </button>
              </header>
              {diagnosis ? (
                <div>
                  <h3>{diagnosis.summary}</h3>
                  <p>{diagnosis.cause}</p>
                  <ol>
                    {diagnosis.evidence.map((item) => <li key={item.eventId}><code>{item.eventId}</code>{item.claim}</li>)}
                  </ol>
                  <strong className="next-step">Next: {diagnosis.nextStep}</strong>
                </div>
              ) : (
                <p>{firstError ? "There is an error in this trace. Ask the investigator to tie its explanation to the recorded events." : "The action completed. The investigator can summarize the path without inventing missing evidence."}</p>
              )}
            </section>
          )}
        </>
      )}
    </aside>
  );
}
