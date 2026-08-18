import { useEffect, useRef } from "react";

import { ExternalIcon } from "../icons.jsx";

export function AppPreview({ project, pairing, onReady, onOpenWindow }) {
  const frame = useRef(null);

  useEffect(() => {
    function receive(event) {
      if (!pairing || event.data?.type !== "lb.ready") return;
      if (event.origin !== pairing.runtimeOrigin || event.data.projectId !== project.id) return;
      if (event.source !== frame.current?.contentWindow) return;
      event.source.postMessage({ type: "lb.pair", projectId: project.id, code: pairing.code }, event.origin);
      onReady?.();
    }
    window.addEventListener("message", receive);
    return () => window.removeEventListener("message", receive);
  }, [pairing, project.id, onReady]);

  if (!project.runtimeUrl) {
    return (
      <div className="preview-empty">
        <strong>No published runtime yet</strong>
        <p>Publish through Replit, then connect the URL to watch the app inside this workspace.</p>
      </div>
    );
  }

  return (
    <section className="preview-shell">
      <header>
        <span><i></i>{new URL(project.runtimeUrl).hostname}</span>
        <button type="button" onClick={onOpenWindow}>Open synchronized window <ExternalIcon /></button>
      </header>
      <iframe
        key={pairing?.code || "unpaired"}
        ref={frame}
        title={`${project.name} runtime`}
        src={project.runtimeUrl}
        sandbox="allow-forms allow-modals allow-popups allow-same-origin allow-scripts"
      />
      <footer>
        If the app blocks framing, use the synchronized window. Runtime evidence still returns here.
      </footer>
    </section>
  );
}
