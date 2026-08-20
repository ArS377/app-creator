import { ArrowIcon, CloseIcon } from "../icons.jsx";

const steps = [
  {
    number: "01",
    label: "Describe",
    title: "Start with an app, not a diagram.",
    body: "Write the product you want. BluePrinted asks Replit to build a working app and keeps the editor link it returns.",
    output: "Output: a real Replit app you can open and publish."
  },
  {
    number: "02",
    label: "Inspect",
    title: "Turn the code into a readable map.",
    body: "Once Agent finishes, inspect the app. Components, routes, tables, AI calls, and live channels appear as a versioned blueprint.",
    output: "Dashed boundaries are inferred. Solid boundaries have runtime evidence."
  },
  {
    number: "03",
    label: "Observe",
    title: "Use the app and watch the path.",
    body: "Pair the published runtime, click through it normally, and follow each action across the system. Trace data is stripped to a narrow allowlist before storage.",
    output: "One action becomes an ordered, inspectable trace."
  },
  {
    number: "04",
    label: "Change",
    title: "Update the app without losing the before.",
    body: "Send a change to Replit, inspect again, and compare architecture snapshots. The old trace stays attached to the version that produced it.",
    output: "Added and removed boundaries are separated from behavior changes."
  }
];

export function Tutorial({ open, step, onStep, onClose }) {
  if (!open) return null;
  const current = steps[step];
  return (
    <div className="tutorial-backdrop" role="presentation">
      <section className="tutorial-sheet" role="dialog" aria-modal="true" aria-labelledby="tutorial-title">
        <header className="tutorial-head">
          <div>
            <span className="eyebrow">Sixty-second tour</span>
            <strong>What comes out of BluePrinted</strong>
          </div>
          <button className="icon-button" type="button" onClick={onClose} aria-label="Close tutorial">
            <CloseIcon />
          </button>
        </header>

        <div className="tutorial-body">
          <nav className="tutorial-index" aria-label="Tutorial steps">
            {steps.map((item, index) => (
              <button
                className={index === step ? "is-current" : index < step ? "is-done" : ""}
                type="button"
                onClick={() => onStep(index)}
                key={item.number}
              >
                <span>{item.number}</span>
                <strong>{item.label}</strong>
              </button>
            ))}
          </nav>

          <div className={`tutorial-plate plate-${step}`}>
            <div className="tutorial-diagram" aria-hidden="true">
              <span className="diagram-prompt">prompt</span>
              <i></i>
              <span className="diagram-replit">Replit app</span>
              <i></i>
              <span className="diagram-map">living map</span>
            </div>
            <span className="tutorial-number">{current.number}</span>
            <p className="eyebrow">{current.label}</p>
            <h2 id="tutorial-title">{current.title}</h2>
            <p className="tutorial-copy">{current.body}</p>
            <p className="tutorial-output">{current.output}</p>
          </div>
        </div>

        <footer className="tutorial-foot">
          <span>{step + 1} of {steps.length}</span>
          {step < steps.length - 1 ? (
            <button className="button button-ink" type="button" onClick={() => onStep(step + 1)}>
              Next <ArrowIcon />
            </button>
          ) : (
            <button className="button button-clay" type="button" onClick={onClose}>
              Try the sample <ArrowIcon />
            </button>
          )}
        </footer>
      </section>
    </div>
  );
}
