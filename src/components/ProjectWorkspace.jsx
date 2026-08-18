import { useEffect, useMemo, useRef, useState } from "react";

import { ExternalIcon } from "../icons.jsx";
import { AppPreview } from "./AppPreview.jsx";
import { Blueprint } from "./Blueprint.jsx";
import { EvidencePanel } from "./EvidencePanel.jsx";

function statusCopy(project) {
  return {
    creating: "requesting app",
    agent_working: "Agent working",
    inspecting: "reading architecture",
    publishing: "publishing",
    published: "published",
    observable: "observable",
    updating: "updating",
    failed: "needs attention"
  }[project.status] || project.status;
}

export function ProjectWorkspace({
  project,
  busyAction,
  onInspect,
  onPublish,
  onPublishStatus,
  onUpdate,
  onPair,
  onRevokePairing,
  onDelete,
  onInvestigate,
  traces,
  evidence,
  activeTrace,
  onTrace,
  liveEvent,
  live,
  pairing,
  diagnosis,
  diagnosisBusy
}) {
  const [view, setView] = useState("blueprint");
  const [runtimeUrl, setRuntimeUrl] = useState(project.runtimeUrl || "");
  const [change, setChange] = useState("");
  const [showUpdate, setShowUpdate] = useState(false);
  const [activeEvent, setActiveEvent] = useState(null);
  const runtimeWindow = useRef(null);

  useEffect(() => setRuntimeUrl(project.runtimeUrl || ""), [project.runtimeUrl]);
  useEffect(() => {
    if (liveEvent) setActiveEvent(liveEvent);
  }, [liveEvent]);

  useEffect(() => {
    function receive(event) {
      if (!pairing || event.data?.type !== "lb.ready") return;
      if (event.origin !== pairing.runtimeOrigin || event.data.projectId !== project.id) return;
      if (event.source !== runtimeWindow.current) return;
      event.source.postMessage({ type: "lb.pair", projectId: project.id, code: pairing.code }, event.origin);
    }
    window.addEventListener("message", receive);
    return () => window.removeEventListener("message", receive);
  }, [pairing, project.id]);

  const manifest = project.currentManifest?.manifest;
  const currentTrace = useMemo(() => {
    if (!activeTrace) return null;
    if (liveEvent && liveEvent.traceId === activeTrace.id) {
      const exists = activeTrace.events?.some((event) => event.id === liveEvent.id);
      return exists ? activeTrace : { ...activeTrace, events: [...(activeTrace.events || []), liveEvent] };
    }
    return activeTrace;
  }, [activeTrace, liveEvent]);

  function openRuntime() {
    if (!project.runtimeUrl) return;
    runtimeWindow.current = window.open(project.runtimeUrl, `living-blueprint-${project.id}`);
  }

  function submitUpdate(event) {
    event.preventDefault();
    onUpdate(change).then((result) => {
      if (result) {
        setChange("");
        setShowUpdate(false);
      }
    });
  }

  return (
    <div className="workspace-page project-workspace">
      <section className="project-command">
        <div className="project-title-block">
          <span className={`project-state state-${project.status}`}><i></i>{statusCopy(project)}</span>
          <h1>{project.name}</h1>
          <p>{project.prompt}</p>
        </div>
        <div className="project-actions">
          {project.replUrl && (
            <a className="button button-paper" href={project.replUrl} target="_blank" rel="noreferrer">
              Open in Replit <ExternalIcon />
            </a>
          )}
          <button className="button button-paper" type="button" onClick={onInspect} disabled={Boolean(busyAction)}>
            {busyAction === "inspect" ? "Inspecting" : manifest ? "Inspect again" : "Inspect build"}
          </button>
          {project.status === "publishing" ? (
            <button className="button button-clay" type="button" onClick={onPublishStatus} disabled={Boolean(busyAction)}>Check publish status</button>
          ) : (
            <button className="button button-clay" type="button" onClick={onPublish} disabled={Boolean(busyAction) || !project.replId}>
              {busyAction === "publish" ? "Publishing" : project.runtimeUrl ? "Republish" : "Publish app"}
            </button>
          )}
        </div>
      </section>

      {project.lastError && (
        <div className={`project-notice ${project.outcomeUnknown ? "is-warning" : "is-error"}`}>
          <strong>{project.outcomeUnknown ? "The result is still unknown" : "This step needs attention"}</strong>
          <p>{project.lastError}</p>
        </div>
      )}

      <nav className="workspace-tabs" aria-label="Project views">
        <button className={view === "blueprint" ? "is-active" : ""} type="button" onClick={() => setView("blueprint")}>Blueprint</button>
        <button className={view === "app" ? "is-active" : ""} type="button" onClick={() => setView("app")}>App runtime</button>
        <button className={view === "changes" ? "is-active" : ""} type="button" onClick={() => setView("changes")}>Changes</button>
        <span></span>
        <button className="update-action" type="button" onClick={() => setShowUpdate(true)}>Send an update to Replit</button>
      </nav>

      <div className="workspace-grid">
        <main className="workspace-main">
          {view === "blueprint" && (
            manifest ? (
              <Blueprint
                manifest={manifest}
                evidence={evidence}
                activeNodeId={activeEvent?.nodeId}
                diff={project.manifestDiff}
              />
            ) : (
              <section className="manifest-empty">
                <span className="eyebrow">Blueprint pending</span>
                <h2>Let Replit finish, then inspect the build.</h2>
                <p>Living Blueprint will ask Agent for a strict architecture manifest. It will not fill the map with guessed progress while Agent is working.</p>
                <ol>
                  <li className={project.replId ? "is-done" : ""}><span>01</span> Replit project returned</li>
                  <li><span>02</span> Agent finishes the app</li>
                  <li><span>03</span> Manifest passes validation</li>
                </ol>
                <button className="button button-ink" type="button" onClick={onInspect} disabled={Boolean(busyAction) || !project.replId}>Inspect build</button>
              </section>
            )
          )}

          {view === "app" && (
            <div className="runtime-view">
              <form className="runtime-connect" onSubmit={(event) => { event.preventDefault(); onPair(runtimeUrl); }}>
                <div>
                  <span className="eyebrow">Runtime pairing</span>
                  <strong>{project.pairingStatus === "connected" ? "Runtime connected" : "Connect the published app"}</strong>
                  <p>The one-use code can submit traces for this project. It cannot edit the app or read stored data.</p>
                </div>
                <label>
                  Published URL
                  <input type="url" value={runtimeUrl} onChange={(event) => setRuntimeUrl(event.target.value)} placeholder="https://your-app.replit.app" required />
                </label>
                {project.pairingStatus === "connected" ? (
                  <button className="button button-paper" type="button" onClick={onRevokePairing}>Disconnect runtime</button>
                ) : (
                  <button className="button button-teal" type="submit" disabled={busyAction === "pair"}>{busyAction === "pair" ? "Creating code" : "Pair runtime"}</button>
                )}
              </form>
              <AppPreview project={{ ...project, runtimeUrl }} pairing={pairing} onOpenWindow={openRuntime} />
            </div>
          )}

          {view === "changes" && (
            <section className="changes-view">
              <header>
                <span className="eyebrow">Version history</span>
                <h2>{project.versions.length} stored {project.versions.length === 1 ? "version" : "versions"}</h2>
              </header>
              <ol>
                {[...project.versions].reverse().map((version, index) => (
                  <li key={version.id}>
                    <span>v{project.versions.length - index}</span>
                    <div><strong>{version.kind}</strong><p>{version.prompt}</p></div>
                    <small>{version.status}</small>
                  </li>
                ))}
              </ol>
              {project.manifestDiff ? (
                <div className="change-summary">
                  <strong>Latest architecture change</strong>
                  <span>+{project.manifestDiff.nodes.added.length} added</span>
                  <span>{project.manifestDiff.nodes.changed.length} changed</span>
                  <span>−{project.manifestDiff.nodes.removed.length} removed</span>
                </div>
              ) : <p className="no-change">Inspect a second version to calculate the first architecture diff.</p>}
              <div className="project-danger">
                <div>
                  <strong>Remove this blueprint</strong>
                  <p>This deletes its manifests, stored traces, pairing codes, and local project history. The Replit app is not deleted.</p>
                </div>
                <button type="button" onClick={() => {
                  if (window.confirm("Remove this blueprint and its stored traces? The Replit app will stay in your workspace.")) onDelete();
                }}>Remove from Living Blueprint</button>
              </div>
            </section>
          )}
        </main>

        <EvidencePanel
          project={project}
          traces={traces}
          activeTrace={currentTrace}
          activeEventId={activeEvent?.id}
          onTrace={onTrace}
          onEvent={setActiveEvent}
          diagnosis={diagnosis}
          diagnosisBusy={diagnosisBusy}
          onInvestigate={onInvestigate}
          live={live}
        />
      </div>

      {showUpdate && (
        <div className="update-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowUpdate(false); }}>
          <form className="update-sheet" onSubmit={submitUpdate}>
            <span className="eyebrow">Prompt update</span>
            <h2>What should change?</h2>
            <p>Replit edits the current app. Living Blueprint keeps this version's map and traces before asking for a new snapshot.</p>
            <textarea value={change} onChange={(event) => setChange(event.target.value)} minLength={10} maxLength={3000} placeholder="Add shared collections so two people can organize findings together." required autoFocus />
            <footer>
              <button className="button button-paper" type="button" onClick={() => setShowUpdate(false)}>Cancel</button>
              <button className="button button-clay" type="submit" disabled={change.trim().length < 10 || busyAction === "update"}>{busyAction === "update" ? "Sending update" : "Update on Replit"}</button>
            </footer>
          </form>
        </div>
      )}
    </div>
  );
}
