import { Router } from "express";
import { z } from "zod";

const pairingSchema = z.object({
  runtimeUrl: z.url().max(500)
}).strict();

const exchangeSchema = z.object({
  code: z.string().min(20).max(200)
}).strict();

function asyncRoute(handler) {
  return (request, response, next) => Promise.resolve(handler(request, response)).catch(next);
}

function websocketUrl(request) {
  const origin = process.env.PUBLIC_ORIGIN || `${request.protocol}://${request.get("host")}`;
  const url = new URL(origin);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.pathname = "/ws/traces";
  return url.toString();
}

function allowRuntimeCors(request, response) {
  const origin = String(request.headers.origin || "");
  if (origin) response.setHeader("access-control-allow-origin", origin);
  response.setHeader("access-control-allow-methods", "POST, OPTIONS");
  response.setHeader("access-control-allow-headers", "content-type");
  response.setHeader("vary", "Origin");
}

export function createTraceRouter(options) {
  const router = Router();

  router.post("/api/projects/:projectId/pairings", asyncRoute(async (request, response) => {
    const input = pairingSchema.parse(request.body);
    const pairing = await options.pairings.issue(
      request.livingBlueprintSession.id,
      request.params.projectId,
      input.runtimeUrl
    );
    response.status(201).json({
      pairing,
      messageType: "lb.pair",
      bridgeUrl: `${process.env.PUBLIC_ORIGIN || `${request.protocol}://${request.get("host")}`}/bridge/v1.js`
    });
  }));

  router.delete("/api/projects/:projectId/pairings", asyncRoute(async (request, response) => {
    await options.pairings.revokeProject(
      request.livingBlueprintSession.id,
      request.params.projectId
    );
    response.status(204).end();
  }));

  router.options("/api/runtime/pairings/exchange", (request, response) => {
    allowRuntimeCors(request, response);
    response.status(204).end();
  });

  router.post("/api/runtime/pairings/exchange", asyncRoute(async (request, response) => {
    allowRuntimeCors(request, response);
    const input = exchangeSchema.parse(request.body);
    const result = await options.pairings.exchange(input.code, String(request.headers.origin || ""));
    response.json({ ...result, websocketUrl: websocketUrl(request) });
  }));

  router.get("/api/projects/:projectId/traces", asyncRoute(async (request, response) => {
    const project = await options.repository.get(
      request.livingBlueprintSession.id,
      request.params.projectId
    );
    if (!project) {
      response.status(404).json({ error: "Project not found." });
      return;
    }
    const [traces, evidence] = await Promise.all([
      options.traces.list(project.id),
      options.traces.evidence(project.id, project.currentVersionId)
    ]);
    response.json({ traces, evidence });
  }));

  router.get("/api/projects/:projectId/traces/:traceId", asyncRoute(async (request, response) => {
    const project = await options.repository.get(
      request.livingBlueprintSession.id,
      request.params.projectId
    );
    if (!project) {
      response.status(404).json({ error: "Project not found." });
      return;
    }
    const trace = await options.traces.detail(project.id, request.params.traceId);
    if (!trace) {
      response.status(404).json({ error: "Trace not found." });
      return;
    }
    response.json({ trace });
  }));

  router.use((error, _request, response, next) => {
    if (error instanceof z.ZodError) {
      response.status(400).json({ error: error.issues[0]?.message || "The request is invalid." });
      return;
    }
    next(error);
  });

  return router;
}
