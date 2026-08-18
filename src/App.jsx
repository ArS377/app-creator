import { useCallback, useEffect, useMemo, useState } from "react";

import { api } from "./api.js";
import { ExternalIcon, MarkIcon } from "./icons.jsx";
import { Creator } from "./components/Creator.jsx";
import { ProjectWorkspace } from "./components/ProjectWorkspace.jsx";
import { SampleWorkspace } from "./components/SampleWorkspace.jsx";
import { Tutorial } from "./components/Tutorial.jsx";

function viewerSocketUrl(projectId) {
  const url = new URL(window.location.href);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.pathname = "/ws/view";
  url.search = new URLSearchParams({ projectId }).toString();
  return url.toString();
}

function diagnosisTrace(trace) {
  if (!trace) return null;
  const events = (trace.events || []).map((event, index) => ({
    id: event.id,
    at: Number.isFinite(event.at) ? event.at : index * 20,
    node: event.node || event.nodeId,
    kind: event.kind,
    level: event.level === "error" || event.kind === "error" || event.errorClass ? "error" : "info",
    title: event.title || event.kind.replaceAll(".", " "),
    detail: event.detail || [event.operation, event.routeTemplate, event.status, event.errorClass].filter(Boolean).join(" · ") || "Recorded runtime boundary."
  }));
  return {
    id: trace.id,
    status: events.some((event) => event.level === "error") ? "error" : "success",
    fault: null,
    duration: events.at(-1)?.at || 0,
    events
  };
}

export function App() {
  const [connection, setConnection] = useState({ connected: false, loading: true });
  const [projects, setProjects] = useState([]);
  const [screen, setScreen] = useState("sample");
  const [project, setProject] = useState(null);
  const [busyAction, setBusyAction] = useState("");
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [tutorialOpen, setTutorialOpen] = useState(() => localStorage.getItem("lb_tutorial_seen") !== "1");
  const [tutorialStep, setTutorialStep] = useState(0);
  const [traces, setTraces] = useState([]);
  const [evidence, setEvidence] = useState([]);
  const [activeTrace, setActiveTrace] = useState(null);
  const [liveEvent, setLiveEvent] = useState(null);
  const [live, setLive] = useState(false);
  const [pairing, setPairing] = useState(null);
  const [diagnosis, setDiagnosis] = useState(null);
  const [diagnosisBusy, setDiagnosisBusy] = useState(false);
  const [connectionMenu, setConnectionMenu] = useState(false);

  const selectedProjectId = screen !== "sample" && screen !== "create" ? screen : null;

  const showToast = useCallback((message) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 3200);
  }, []);

  const loadProjects = useCallback(async () => {
    const result = await api.get("/api/projects");
    setProjects(result.projects);
    return result.projects;
  }, []);

  const loadProject = useCallback(async (projectId) => {
    const result = await api.get(`/api/projects/${projectId}`);
    setProject(result.project);
    setProjects((current) => current.map((item) => item.id === projectId ? result.project : item));
    return result.project;
  }, []);

  const loadTraces = useCallback(async (projectId) => {
    const result = await api.get(`/api/projects/${projectId}/traces`);
    setTraces(result.traces);
    setEvidence(result.evidence);
    if (result.traces[0]) {
      const detail = await api.get(`/api/projects/${projectId}/traces/${result.traces[0].id}`);
      setActiveTrace(detail.trace);
    } else {
      setActiveTrace(null);
    }
  }, []);

  useEffect(() => {
    Promise.all([
      api.get("/api/replit/connection"),
      loadProjects()
    ]).then(([status]) => setConnection({ ...status, loading: false }))
      .catch((requestError) => setError(requestError.message));

    const params = new URLSearchParams(window.location.search);
    const replit = params.get("replit");
    if (replit === "connected") showToast("Replit connected. You can create an app now.");
    if (replit === "error") setError(params.get("reason") || "Replit connection failed.");
    if (replit) window.history.replaceState({}, "", window.location.pathname);
  }, [loadProjects, showToast]);

  useEffect(() => {
    if (!selectedProjectId) {
      setProject(null);
      setTraces([]);
      setEvidence([]);
      setActiveTrace(null);
      setPairing(null);
      return;
    }
    setError("");
    setDiagnosis(null);
    Promise.all([loadProject(selectedProjectId), loadTraces(selectedProjectId)])
      .catch((requestError) => setError(requestError.message));
  }, [selectedProjectId, loadProject, loadTraces]);

  useEffect(() => {
    if (!selectedProjectId) return undefined;
    const socket = new WebSocket(viewerSocketUrl(selectedProjectId), ["lb-view-v1"]);
    socket.addEventListener("open", () => setLive(true));
    socket.addEventListener("close", () => setLive(false));
    socket.addEventListener("message", (message) => {
      const packet = JSON.parse(message.data);
      if (packet.type !== "trace.event") return;
      const event = packet.event;
      setLiveEvent(event);
      setEvidence((current) => current.some((item) => item.nodeId === event.nodeId)
        ? current
        : [...current, { nodeId: event.nodeId, observedAt: event.receivedAt, traceId: event.traceId }]);
      setTraces((current) => {
        const existing = current.find((trace) => trace.id === event.traceId);
        if (existing) return current.map((trace) => trace.id === event.traceId
          ? { ...trace, eventCount: trace.eventCount + 1, updatedAt: event.timestamp }
          : trace);
        return [{ id: event.traceId, projectId: selectedProjectId, versionId: event.versionId, eventCount: 1, status: event.kind === "error" ? "error" : "running", startedAt: event.timestamp, updatedAt: event.timestamp }, ...current];
      });
      setActiveTrace((current) => {
        if (!current || current.id !== event.traceId) return { id: event.traceId, events: [event], status: event.kind === "error" ? "error" : "running" };
        if (current.events.some((item) => item.id === event.id)) return current;
        return { ...current, events: [...current.events, event] };
      });
    });
    return () => socket.close();
  }, [selectedProjectId]);

  async function runAction(action, callback, successMessage) {
    setBusyAction(action);
    setError("");
    try {
      const result = await callback();
      if (successMessage) showToast(successMessage);
      return result;
    } catch (requestError) {
      if (requestError.code === "REPLIT_CONNECTION_REQUIRED") {
        setConnection({ connected: false, loading: false });
      }
      setError(requestError.message);
      return null;
    } finally {
      setBusyAction("");
    }
  }

  function connect() {
    window.location.assign("/auth/replit/start");
  }

  async function disconnect() {
    await runAction("disconnect", async () => {
      await api.post("/api/replit/disconnect");
      setConnection({ connected: false, connectedAt: null, loading: false });
      setConnectionMenu(false);
    }, "Replit disconnected and runtime pairings revoked.");
  }

  async function create(input) {
    await runAction("create", async () => {
      const result = await api.post("/api/projects", input);
      await loadProjects();
      setScreen(result.project.id);
      return result;
    }, "Replit accepted the project. Open the editor to watch Agent finish.");
  }

  async function projectAction(action, path, body, successMessage) {
    return runAction(action, async () => {
      await api.post(`/api/projects/${project.id}/${path}`, body);
      return loadProject(project.id);
    }, successMessage);
  }

  async function selectTrace(traceId) {
    const result = await api.get(`/api/projects/${project.id}/traces/${traceId}`);
    setActiveTrace(result.trace);
    setDiagnosis(null);
  }

  async function pair(runtimeUrl) {
    await runAction("pair", async () => {
      const result = await api.post(`/api/projects/${project.id}/pairings`, { runtimeUrl });
      setPairing(result.pairing);
      await loadProject(project.id);
    }, "Pairing code ready. Reload or open the app to connect it.");
  }

  async function revokePairing() {
    await runAction("pair", async () => {
      await api.delete(`/api/projects/${project.id}/pairings`);
      setPairing(null);
      await loadProject(project.id);
    }, "Runtime pairing revoked.");
  }

  async function deleteProject() {
    const removed = await runAction("delete", async () => {
      await api.delete(`/api/projects/${project.id}`);
      await loadProjects();
      return true;
    }, "Project data removed from Living Blueprint.");
    if (removed) setScreen("sample");
  }

  async function investigate() {
    if (!activeTrace) return;
    setDiagnosisBusy(true);
    setError("");
    try {
      const result = await api.post("/api/investigate", { trace: diagnosisTrace(activeTrace) });
      setDiagnosis(result);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setDiagnosisBusy(false);
    }
  }

  function closeTutorial() {
    localStorage.setItem("lb_tutorial_seen", "1");
    setTutorialOpen(false);
    setTutorialStep(0);
  }

  const screenTitle = useMemo(() => {
    if (screen === "sample") return "Sample";
    if (screen === "create") return "New app";
    return project?.name || "Project";
  }, [screen, project]);

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">Skip to workspace</a>
      <header className="topbar">
        <button className="brand" type="button" onClick={() => setScreen("sample")} aria-label="Living Blueprint sample">
          <MarkIcon />
          <span>Living Blueprint</span>
        </button>
        <nav className="primary-nav" aria-label="Primary navigation">
          <button className={screen === "sample" ? "is-active" : ""} type="button" onClick={() => setScreen("sample")}>Sample</button>
          <button className={screen !== "sample" ? "is-active" : ""} type="button" onClick={() => setScreen(projects[0]?.id || "create")}>My blueprints</button>
        </nav>
        <div className="topbar-actions">
          <button className="help-button" type="button" onClick={() => setTutorialOpen(true)}>How it works</button>
          {connection.connected ? (
            <div className="connection-menu">
              <button className="connection-badge" type="button" onClick={() => setConnectionMenu((open) => !open)} aria-expanded={connectionMenu}>
                <i></i>Replit connected
              </button>
              {connectionMenu && (
                <div>
                  <strong>Replit workspace</strong>
                  <small>OAuth tokens stay encrypted on this server.</small>
                  <button type="button" onClick={disconnect} disabled={busyAction === "disconnect"}>Disconnect Replit</button>
                </div>
              )}
            </div>
          ) : (
            <button className="button button-ink compact" type="button" onClick={connect}>Connect Replit</button>
          )}
        </div>
      </header>

      <div className="project-ribbon">
        <span className="ribbon-label">Open</span>
        <button className={screen === "sample" ? "is-active sample" : "sample"} type="button" onClick={() => setScreen("sample")}>
          <i></i>Research desk <small>sample</small>
        </button>
        {projects.map((item) => (
          <button className={screen === item.id ? "is-active" : ""} type="button" onClick={() => setScreen(item.id)} key={item.id}>
            <i className={`state-${item.status}`}></i>{item.name}<small>{item.status.replaceAll("_", " ")}</small>
          </button>
        ))}
        <button className={screen === "create" ? "new-project is-active" : "new-project"} type="button" onClick={() => setScreen("create")}>
          <span>+</span> New app
        </button>
        <span className="ribbon-current">{screenTitle}</span>
      </div>

      {error && (
        <div className="global-error" role="alert">
          <strong>Could not complete that step.</strong>
          <span>{error}</span>
          <button type="button" onClick={() => setError("")} aria-label="Dismiss error">×</button>
        </div>
      )}

      <main id="main-content">
        {screen === "sample" && <SampleWorkspace onCreate={() => setScreen("create")} />}
        {screen === "create" && (
          <Creator connected={connection.connected} busy={busyAction === "create"} onCreate={create} onConnect={connect} />
        )}
        {selectedProjectId && project && (
          <ProjectWorkspace
            project={project}
            busyAction={busyAction}
            onInspect={() => projectAction("inspect", "inspect", {}, "Architecture snapshot validated.")}
            onPublish={() => projectAction("publish", "publish", {}, "Publication request sent to Replit.")}
            onPublishStatus={() => projectAction("publish", "publish-status", {}, "Publication status refreshed.")}
            onUpdate={(changeDescription) => projectAction("update", "update", { changeDescription }, "Replit accepted the update.")}
            onPair={pair}
            onRevokePairing={revokePairing}
            onDelete={deleteProject}
            onInvestigate={investigate}
            traces={traces}
            evidence={evidence}
            activeTrace={activeTrace}
            onTrace={selectTrace}
            liveEvent={liveEvent}
            live={live}
            pairing={pairing}
            diagnosis={diagnosis}
            diagnosisBusy={diagnosisBusy}
          />
        )}
        {selectedProjectId && !project && <div className="page-loading">Opening blueprint…</div>}
      </main>

      <footer className="site-foot">
        <span>Runtime traces keep structure, timing, and status. They leave values and secrets behind.</span>
        <a href="https://github.com/ArS377/app-creator" target="_blank" rel="noreferrer">Source <ExternalIcon /></a>
      </footer>

      <Tutorial open={tutorialOpen} step={tutorialStep} onStep={setTutorialStep} onClose={closeTutorial} />
      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  );
}
