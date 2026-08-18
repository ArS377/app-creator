import { useEffect, useRef, useState } from "react";

import { api } from "../api.js";
import { PlayIcon } from "../icons.jsx";
import { sampleManifest, sampleProject, sampleTrace } from "../sample-data.js";
import { Blueprint } from "./Blueprint.jsx";
import { EvidencePanel } from "./EvidencePanel.jsx";

export function SampleWorkspace({ onCreate }) {
  const [fault, setFault] = useState(false);
  const [running, setRunning] = useState(false);
  const [trace, setTrace] = useState(null);
  const [visibleEvents, setVisibleEvents] = useState([]);
  const [activeEvent, setActiveEvent] = useState(null);
  const [diagnosis, setDiagnosis] = useState(null);
  const [diagnosisBusy, setDiagnosisBusy] = useState(false);
  const timers = useRef([]);

  useEffect(() => () => timers.current.forEach(window.clearTimeout), []);

  function run() {
    timers.current.forEach(window.clearTimeout);
    timers.current = [];
    const next = sampleTrace(fault);
    setTrace(next);
    setVisibleEvents([]);
    setActiveEvent(null);
    setDiagnosis(null);
    setRunning(true);
    next.events.forEach((event, index) => {
      const timer = window.setTimeout(() => {
        setVisibleEvents((current) => [...current, event]);
        setActiveEvent(event);
        if (index === next.events.length - 1) setRunning(false);
      }, index * 420 + 180);
      timers.current.push(timer);
    });
  }

  async function investigate() {
    if (!trace) return;
    setDiagnosisBusy(true);
    try {
      const result = await api.post("/api/investigate", {
        trace: { ...trace, events: visibleEvents }
      });
      setDiagnosis(result);
    } finally {
      setDiagnosisBusy(false);
    }
  }

  const activeTrace = trace ? { ...trace, events: visibleEvents } : null;
  const evidence = visibleEvents.map((event) => ({ nodeId: event.nodeId }));

  return (
    <div className="workspace-page sample-workspace">
      <section className="workspace-heading">
        <div>
          <span className="eyebrow">Prepared sample</span>
          <h1>Watch one save cross the app.</h1>
          <p>This action is live in the browser. The Replit build record is a labeled sample.</p>
        </div>
        <button className="text-action" type="button" onClick={onCreate}>Build your own <span>→</span></button>
      </section>

      <section className="sample-action-bar" aria-label="Sample action controls">
        <div className="sample-form-preview">
          <span className="sample-app-name">Fieldnotes</span>
          <div>
            <small>Finding</small>
            <strong>Visible system boundaries shorten feedback loops.</strong>
          </div>
        </div>
        <label className="fault-toggle">
          <input type="checkbox" checked={fault} onChange={(event) => setFault(event.target.checked)} />
          <span><i></i></span>
          <strong>Reject next database write</strong>
          <small>session-only test</small>
        </label>
        <button className="button button-ink" type="button" onClick={run} disabled={running}>
          <PlayIcon /> {running ? "Tracing action" : "Save finding"}
        </button>
      </section>

      <div className="workspace-grid">
        <main className="workspace-main">
          <Blueprint
            manifest={sampleManifest}
            evidence={evidence}
            activeNodeId={activeEvent?.nodeId}
            sample
          />
        </main>
        <EvidencePanel
          project={sampleProject}
          traces={activeTrace ? [activeTrace] : []}
          activeTrace={activeTrace}
          activeEventId={activeEvent?.id}
          onTrace={() => {}}
          onEvent={setActiveEvent}
          diagnosis={diagnosis}
          diagnosisBusy={diagnosisBusy}
          onInvestigate={investigate}
          live={running}
        />
      </div>
    </div>
  );
}
