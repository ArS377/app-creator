import { useMemo, useState } from "react";

const groups = [
  { id: "interface", label: "Interface", kinds: ["component"] },
  { id: "application", label: "Application", kinds: ["route", "service"] },
  { id: "resources", label: "Data + services", kinds: ["table", "ai", "websocket"] }
];

function kindLabel(kind) {
  return {
    component: "UI",
    route: "API",
    service: "service",
    table: "data",
    ai: "AI",
    websocket: "live"
  }[kind] || kind;
}

export function Blueprint({ manifest, evidence = [], activeNodeId, diff, sample = false }) {
  const [selectedId, setSelectedId] = useState(null);
  const observed = useMemo(() => new Set([
    ...evidence.map((item) => item.nodeId),
    ...manifest.nodes.filter((node) => node.evidence === "runtime_observed").map((node) => node.id)
  ]), [evidence, manifest]);
  const selected = manifest.nodes.find((node) => node.id === selectedId) || null;
  const added = new Set(diff?.nodes?.added || []);
  const removedCount = diff?.nodes?.removed?.length || 0;

  return (
    <section className="blueprint" aria-label="Application architecture">
      <div className="blueprint-caption">
        <div>
          <span className="eyebrow">Architecture snapshot</span>
          <strong>{manifest.name}</strong>
          <p>{manifest.summary}</p>
        </div>
        <div className="blueprint-legend">
          <span><i className="legend-mark observed"></i> observed</span>
          <span><i className="legend-mark inferred"></i> inferred</span>
          {diff && <span><i className="legend-mark added"></i> added</span>}
        </div>
      </div>

      <div className="map-columns">
        {groups.map((group, groupIndex) => {
          const nodes = manifest.nodes.filter((node) => group.kinds.includes(node.kind));
          return (
            <div className={`map-column map-${group.id}`} key={group.id}>
              <header>
                <span>0{groupIndex + 1}</span>
                <strong>{group.label}</strong>
                <small>{nodes.length}</small>
              </header>
              <div className="map-node-list">
                {nodes.length ? nodes.map((node) => {
                  const isObserved = observed.has(node.id);
                  const isActive = node.id === activeNodeId;
                  return (
                    <button
                      type="button"
                      className={`map-node ${isObserved ? "is-observed" : "is-inferred"} ${isActive ? "is-active" : ""} ${added.has(node.id) ? "is-added" : ""}`}
                      onClick={() => setSelectedId(node.id === selectedId ? null : node.id)}
                      key={node.id}
                    >
                      <span className="node-kind">{kindLabel(node.kind)}</span>
                      <strong>{node.label}</strong>
                      <span className="node-evidence">{isObserved ? "runtime evidence" : "Agent declared"}</span>
                    </button>
                  );
                }) : (
                  <p className="empty-column">No {group.label.toLowerCase()} boundary reported.</p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="connection-register">
        <header>
          <strong>Connections</strong>
          <span>{manifest.edges.length} declared</span>
        </header>
        <div className="connection-lines">
          {manifest.edges.slice(0, 8).map((edge) => {
            const source = manifest.nodes.find((node) => node.id === edge.source);
            const target = manifest.nodes.find((node) => node.id === edge.target);
            return (
              <button type="button" onClick={() => setSelectedId(edge.target)} key={edge.id}>
                <span>{source?.label || edge.source}</span>
                <i>{edge.relationship}</i>
                <span>{target?.label || edge.target}</span>
              </button>
            );
          })}
          {!manifest.edges.length && <p>No connections were returned in this snapshot.</p>}
        </div>
      </div>

      {selected && (
        <aside className="node-inspector">
          <button type="button" onClick={() => setSelectedId(null)} aria-label="Close boundary detail">×</button>
          <span>{kindLabel(selected.kind)}</span>
          <h3>{selected.label}</h3>
          <code>{selected.id}</code>
          {selected.sourceFile && <p>Source: {selected.sourceFile}</p>}
          <dl>
            {Object.entries(selected.metadata || {}).map(([key, value]) => (
              <div key={key}><dt>{key}</dt><dd>{String(value)}</dd></div>
            ))}
          </dl>
        </aside>
      )}

      {diff && (
        <footer className="diff-strip">
          <strong>Since the previous snapshot</strong>
          <span className="diff-added">+{diff.nodes.added.length} boundaries</span>
          <span className="diff-changed">{diff.nodes.changed.length} changed</span>
          <span className="diff-removed">−{removedCount} removed</span>
        </footer>
      )}

      {sample && <span className="sample-stamp">prepared sample</span>}
    </section>
  );
}
