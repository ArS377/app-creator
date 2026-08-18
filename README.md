# Living Blueprint

Living Blueprint turns one app action into an explorable system trace. Use the prepared research app, watch a save cross the browser, API, database, and trace stream, then reject the database write on purpose and inspect the evidence.

The first version is built for a reliable public demo:

- The sample interaction, fault, trace, timeline, and diagnosis run live.
- The Replit build and prompt update are labeled recordings.
- The investigator uses a configured model when one is available. Its local evidence engine keeps the demo working without a key.
- Every diagnosis citation is checked against the supplied trace before it reaches the interface.

## Run it

Living Blueprint has no runtime packages to install. It uses Node's built-in HTTP server and browser-native JavaScript.

```bash
npm start
```

Open `http://localhost:3000`. Run the test suite with:

```bash
npm test
```

Node 20 or newer is required.

## Put it on Replit

Import this GitHub repository into Replit and press **Run**. The included `.replit` file sets the development and deployment commands. Publish it as an Autoscale or Reserved VM app when the demo is ready.

To use a model for trace diagnosis, add these values with Replit's **Secrets** tool:

```text
OPENAI_API_KEY=your-key
OPENAI_MODEL=your-model
```

`OPENAI_BASE_URL` is optional. Without both required values, the server uses the local evidence engine and labels the result accordingly. Secrets stay on the server and never enter a replay, trace event, or browser bundle.

Replit reference: [app configuration](https://docs.replit.com/replit-app/configuration), [Secrets](https://docs.replit.com/core-concepts/project-editor/app-setup/secrets), and [publishing options](https://docs.replit.com/learn/projects-and-artifacts/replit-deployments).

## Demo loop

1. Watch the prepared Replit build replay.
2. Save a finding in the live sample app.
3. Scrub the recorded events or select a system-map boundary.
4. Turn on **Reject database write** and retry.
5. Open the investigator's evidence links.
6. Watch the prepared prompt-update replay and compare the architecture snapshots.

## Architecture

```text
browser sample app
      │
      ├── correlated trace events ──> timeline + system map
      │
      └── POST /api/investigate ───> sanitizer ───> model or local evidence engine
                                                    │
                                                    └── citation validator
```

The server keeps only an anonymous, in-memory session record for expiry and rate limiting. Sessions expire after 30 minutes. Trace sanitization accepts a short allowlist of fields and drops raw form values, credentials, headers, database rows, and prompt contents.

The full product and engineering decisions are in [docs/design.md](docs/design.md).

## Current scope

This repository contains Version 0 from the design: one prepared Replit app, one traced action, one controlled database fault, and two recorded replays. Visitor-created apps, Replit OAuth, instrumented source-Repl copies, and live architecture updates belong to the gated next versions.
