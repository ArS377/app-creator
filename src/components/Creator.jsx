import { useState } from "react";

import { ArrowIcon } from "../icons.jsx";
import { promptExamples } from "../sample-data.js";

export function Creator({ connected, busy, onCreate, onConnect }) {
  const [name, setName] = useState("");
  const [prompt, setPrompt] = useState("");

  function submit(event) {
    event.preventDefault();
    if (!connected) {
      onConnect();
      return;
    }
    onCreate({ name, prompt });
  }

  return (
    <section className="creator" aria-labelledby="creator-title">
      <header className="creator-intro">
        <span className="eyebrow">New blueprint</span>
        <h1 id="creator-title">Build an app you can look inside.</h1>
        <p>
          Replit makes the app. BluePrinted keeps its architecture and runtime behavior readable as it changes.
        </p>
      </header>

      <form className="prompt-desk" onSubmit={submit}>
        <div className="prompt-desk-head">
          <label htmlFor="project-name">Project name <span>optional</span></label>
          <input
            id="project-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Fieldnotes"
            maxLength={72}
          />
        </div>
        <label className="prompt-label" htmlFor="project-prompt">What should Replit build?</label>
        <textarea
          id="project-prompt"
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          placeholder="Describe the product, who uses it, and the action that matters most."
          minLength={20}
          maxLength={4000}
          required
        />
        <div className="prompt-desk-foot">
          <span>{prompt.length.toLocaleString()} / 4,000</span>
          <button className="button button-clay" type="submit" disabled={busy || prompt.trim().length < 20}>
            {busy ? "Sending to Replit" : connected ? "Build on Replit" : "Connect Replit to build"}
            {!busy && <ArrowIcon />}
          </button>
        </div>
      </form>

      <div className="prompt-examples">
        <span>Try a starting point</span>
        <div>
          {promptExamples.map((example) => (
            <button type="button" onClick={() => setPrompt(example)} key={example}>
              {example}
            </button>
          ))}
        </div>
      </div>

      <aside className="output-note">
        <strong>You get two things</strong>
        <p>A working Replit app and a versioned blueprint backed by the actions you run.</p>
      </aside>
    </section>
  );
}
