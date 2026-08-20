# BluePrinted

BluePrinted creates a Replit app, turns its architecture into a readable map, and uses runtime evidence to show what the app actually did.

The output is both a working Replit app and a versioned technical record:

- the Replit editor and published app URLs;
- architecture snapshots for components, routes, tables, AI calls, services, and live channels;
- stored diffs after prompt updates;
- sanitized traces from the published runtime;
- diagnoses that cite event IDs from the selected trace.

The prepared research-desk sample works before sign-in. It includes a successful save, a session-only database fault, trace playback, and evidence-linked diagnosis.

## Product loop

1. Describe the app.
2. Authorize Replit and let Agent build it.
3. Inspect the finished code to create the first architecture snapshot.
4. Publish through Replit and pair the runtime.
5. Use the app and watch its actions confirm the map.
6. Send an update, inspect again, and compare the two snapshots.

BluePrinted shows only states backed by an MCP result, a validated manifest, publication status, or a runtime event. It does not display invented build percentages or Agent's private reasoning.

## Stack

- React 19 and Vite 8
- Express 5
- PostgreSQL through `pg`, with an in-memory local fallback
- `ws` for trace ingest and live viewing
- Model Context Protocol TypeScript SDK
- Zod validation
- Node's built-in test runner

Inter is bundled with the app. The interface does not depend on a font CDN.

## Run locally

Node 20 or newer is required.

```bash
npm install
npm start
```

`npm start` builds the React client, then starts the server at `http://localhost:3000`.

For client hot reload, use two terminals:

```bash
npm run dev:server
npm run dev
```

Vite runs at `http://localhost:5173` and proxies API, OAuth, and WebSocket traffic to port 3000.

Run the complete check with:

```bash
npm run check
```

The suite covers encryption, OAuth state, manifest validation, architecture diffs, project lifecycle, persistent sessions, pairing expiry and replay protection, trace redaction and quotas, diagnosis evidence, HTTP routes, and the real WebSocket boundary.

## Configuration

Copy `.env.example` into your environment and set the values through Replit Secrets or your local shell.

| Variable | Required in production | Purpose |
| --- | --- | --- |
| `SESSION_SECRET` | Yes | Encrypts Replit OAuth records and signs scoped trace tokens. Use at least 32 random characters. |
| `DATABASE_URL` | Yes | Stores sessions, projects, versions, encrypted credentials, manifests, pairings, and traces. |
| `PUBLIC_ORIGIN` | Usually | Public HTTPS origin used for OAuth callbacks and runtime pairing. A Replit deployment can derive this from `REPLIT_DOMAINS`. |
| `SOURCE_REPL_ID` | Recommended | Starts each app as a private copy of the maintained instrumented source Repl. Without it, creation uses the same contract in the Agent prompt. |
| `OPENAI_API_KEY` | No | Enables model-backed trace diagnosis. |
| `OPENAI_MODEL` | No | Selects the diagnosis model. Both OpenAI values are required to enable it. |
| `OPENAI_BASE_URL` | No | Overrides the Responses API base URL. |

Production startup stops with a clear error when the session secret, database, or public origin is unavailable. Local development uses memory storage and a development-only secret.

## Replit connection

The server connects to `https://replit-mcp.com/server/mcp` through Streamable HTTP and OAuth 2.1 with PKCE. The MCP SDK handles protected-resource discovery, dynamic client registration, PKCE, token exchange, and token refresh. BluePrinted supplies the callback route, state check, encrypted token storage, and disconnect cleanup.

The integration uses these public tools:

- `create_app_from_prompt`
- `list_apps`
- `search_apps`
- `resolve_app_by_name`
- `ask_question`
- `update_app_using_prompt`
- `publish_app`
- `get_publish_status`

Creation and updates can outlive an MCP request. A timeout is recorded as an unknown outcome and is never retried automatically, since a retry could create a duplicate app or apply the same update twice.

## Runtime evidence

The browser bridge is published at `/bridge/v1.js`. Generated apps import `createBluePrintedBridge`, provide the project ID and control-plane origin, then wrap the important user actions.

The pairing path is deliberately narrow:

1. BluePrinted issues a random code tied to the project, version, exact runtime origin, browser session, and five-minute expiry.
2. The code is sent with strict-origin `postMessage` to the frame or synchronized window.
3. The runtime exchanges it once for a signed trace token.
4. The token can submit trace events for one project. It cannot call Replit, change an app, read traces, or run the investigator.
5. The server validates and sanitizes every event before storage.

Runtime events are limited to 4 KB, 256 events per trace, 25 events per second with a short burst of 100, and seven-day retention. The allowlist keeps IDs, timings, normalized route templates, operation names, status, safe error classes, and parent relationships. It drops bodies, values, SQL, query values, headers, cookies, tokens, prompts, responses, environment variables, and raw error messages.

Replit MCP does not currently install a per-app secret. Version 1 therefore marks browser relay evidence as observed and leaves server-only spans unavailable unless the source app has a separately provisioned safe relay.

## Publish the control plane on Replit

1. Import this GitHub repository into Replit.
2. Add a PostgreSQL database.
3. Add `SESSION_SECRET` and any optional model values through Secrets.
4. Set `SOURCE_REPL_ID` when the maintained instrumented starter is ready.
5. Press **Run** to verify the sample and health endpoint.
6. Publish as an Autoscale or Reserved VM app.
7. Confirm that `/api/health` reports `persistence: postgres`.
8. Connect a Replit account from the published app and run one create, inspect, publish, pair, trace, and update cycle.

The included `.replit` file runs `npm run check` during deployment and starts the built Express application.

## Repository guide

- `src/` contains the React workspace and prepared sample.
- `server/replit-*` contains OAuth, MCP, result parsing, and HTTP routes.
- `server/project-*` owns project versions, creation, updates, inspection, and publication.
- `server/pairing-service.js`, `server/trace-*`, and `public/bridge/v1.js` form the observation path.
- `lib/manifest.js` validates, hashes, and compares architecture snapshots.
- `lib/investigator.js` sanitizes traces and checks diagnosis citations.
- `docs/design.md` records the product and engineering decisions.
- `docs/version-1.md` records the implementation boundary with the public Replit MCP.

## Current boundary

The implementation is complete and testable with fake MCP clients locally. A live create requires three external facts that are not stored in this repository: a public callback URL, a user's Replit consent, and Replit billing or workspace access for Agent and publishing. The app surfaces those steps instead of pretending they already happened.
