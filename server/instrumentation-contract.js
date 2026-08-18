const contract = `
Living Blueprint observation contract:
- Keep the existing tracing bridge and stable lb IDs if this app started from a source Repl.
- Use React for the interface and Express for server routes. Use PostgreSQL and ws only when the requested product needs them.
- Give important UI actions, route templates, tables, AI calls, and WebSocket channels deterministic IDs.
- Browser trace events may contain only: id, traceId, parentId, timestamp, durationMs, kind, nodeId, routeTemplate, operation, status, errorClass, and source.
- Never trace form values, URLs with query values, request or response bodies, SQL, database values, cookies, headers, tokens, prompts, model responses, environment variables, or raw error messages.
- Keep the observation bridge after later changes. Do not weaken origin checks or event allowlists.
`.trim();

export function generationPrompt(userPrompt, identifiers) {
  return `${userPrompt.trim()}

${contract}

Project identity:
- appId: ${identifiers.appId}
- versionId: ${identifiers.versionId}

Build the requested product first. Treat observation as a small supporting layer, not the visual theme of the app.`;
}

export function updatePrompt(changeDescription, identifiers) {
  return `${changeDescription.trim()}

Keep every working feature that the change does not replace.

${contract}

Current project identity:
- appId: ${identifiers.appId}
- versionId: ${identifiers.versionId}`;
}

export function manifestQuestion(identifiers) {
  return `Inspect the current app without changing it. Return one JSON object and no markdown.

Use exactly this shape:
{
  "schemaVersion": "1",
  "appId": "${identifiers.appId}",
  "versionId": "${identifiers.versionId}",
  "name": "short app name",
  "summary": "one factual sentence",
  "nodes": [
    {
      "id": "stable deterministic ID",
      "kind": "component | route | table | ai | websocket | service",
      "label": "short label",
      "evidence": "agent_declared",
      "sourceFile": "relative path",
      "metadata": { "method": "POST" }
    }
  ],
  "edges": [
    {
      "id": "source|relationship|target",
      "source": "existing node ID",
      "target": "existing node ID",
      "relationship": "calls | reads | writes | publishes | subscribes | renders | invokes",
      "evidence": "agent_declared"
    }
  ]
}

Include only important runtime boundaries you can support from the code. Use no more than 200 nodes and 400 edges. Do not include secrets, source text, prompt text, data values, or raw URLs with query strings.`;
}
