# Version 1 implementation contract

This document records the boundary between Living Blueprint and the public Replit MCP as of August 18, 2026. The official reference is [Replit MCP Server](https://docs.replit.com/platforms/mcp-server).

## What the integration can do

Living Blueprint connects to `https://replit-mcp.com/server/mcp` over Streamable HTTP. OAuth 2.1 with PKCE protects the connection. Tokens, client registration data, code verifiers, and state stay encrypted on the server.

The current public tools support three operations:

- `create_app_from_prompt` creates a new Replit app and returns its Repl ID and editor URL.
- `update_app_using_prompt` asks Agent to change that app.
- `ask_question` inspects the app without changing it.

Creation and updates are asynchronous. An MCP timeout does not prove failure and must not trigger a duplicate request. Living Blueprint records the accepted operation, shows the editor URL, and lets the user run a fresh inspection when Agent finishes.

## What the integration cannot do

The current public tools do not clone a source Repl, publish an app, report publication status, install a Replit Secret, or expose Agent's private reasoning. The interface does not imitate any of those abilities.

Users finish and publish their app in Replit. Living Blueprint only shows states supported by a returned tool result, a validated manifest, or runtime evidence.

## Generated-app contract

The creation prompt includes a compact instrumentation contract. It asks Agent to:

1. use React, Express, Postgres, and WebSockets where the product needs them;
2. install a small browser trace bridge with an explicit allowlist;
3. assign stable IDs to important components, routes, tables, and channels;
4. expose a health description that contains no secrets or user data;
5. keep the bridge in later updates.

After creation or update, Living Blueprint uses `ask_question` to request strict manifest JSON. It validates the shape, caps the number of nodes and edges, and marks the result as inferred. Only matching runtime events promote a node to observed.

Prompt instructions are not a security boundary. The ingest service validates and sanitizes every event itself.

## Runtime pairing

Replit MCP cannot install a persistent server credential. Version 1 therefore uses browser relay mode:

1. The control plane issues a random, single-use code tied to the project, current browser session, exact app origin, and a five-minute expiry.
2. The control room sends it only after checking `event.origin` and `event.source`.
3. The generated app exchanges it for a short-lived token limited to trace ingestion for that project.
4. The browser bridge sends allowlisted events over WebSocket. The server enforces size, rate, count, origin, project, and expiry checks.

This token cannot call Replit, modify an app, read stored traces, or run an investigation. Server-only spans remain marked unavailable until a safe Replit secret path exists.

## Confirmed product states

- `draft`: the user has not sent the prompt.
- `creating`: the create request is in flight.
- `agent_working`: Replit returned a Repl ID or the call timed out after acceptance.
- `inspecting`: Living Blueprint is asking for the manifest.
- `needs_replit`: the user needs to finish or publish in Replit.
- `observable`: a valid manifest and runtime pairing are available.
- `updating`: an update request is in flight.
- `failed`: Replit returned a definite error.

There is no synthetic percentage meter. Each displayed milestone has an evidence source and timestamp.

## Version 1 acceptance

Version 1 is complete when the repository includes:

- an encrypted OAuth provider with state validation and reconnect support;
- real MCP create, update, and inspection calls behind a testable client boundary;
- persistent projects, versions, manifests, pairings, and sanitized traces;
- strict manifest validation and deterministic snapshot diffs;
- WebSocket trace ingest with quotas and live viewer updates;
- a sample workspace that teaches the product before sign-in;
- a connected workspace for generated Replit apps;
- automated tests for OAuth storage, manifest validation, redaction, pairing, quotas, and core HTTP routes;
- a production build and Replit run configuration.
