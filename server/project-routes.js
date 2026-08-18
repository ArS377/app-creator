import { Router } from "express";
import { z } from "zod";

import { ReplitConnectionRequiredError } from "./replit-mcp.js";

const createSchema = z.object({
  name: z.string().trim().max(72).optional(),
  prompt: z.string().trim().min(20).max(4000)
}).strict();

const updateSchema = z.object({
  changeDescription: z.string().trim().min(10).max(3000)
}).strict();

function publicOrigin(request) {
  if (process.env.PUBLIC_ORIGIN) return process.env.PUBLIC_ORIGIN.replace(/\/$/, "");
  const protocol = String(request.headers["x-forwarded-proto"] || request.protocol).split(",")[0].trim();
  return `${protocol}://${request.get("host")}`;
}

function redirectUrl(request) {
  return `${publicOrigin(request)}/auth/replit/callback`;
}

function asyncRoute(handler) {
  return (request, response, next) => Promise.resolve(handler(request, response)).catch(next);
}

export function createProjectRouter(projects) {
  const router = Router();

  router.get("/api/projects", asyncRoute(async (request, response) => {
    response.json({ projects: await projects.list(request.livingBlueprintSession.id) });
  }));

  router.get("/api/projects/:projectId", asyncRoute(async (request, response) => {
    const project = await projects.detail(request.livingBlueprintSession.id, request.params.projectId);
    if (!project) {
      response.status(404).json({ error: "Project not found." });
      return;
    }
    response.json({ project });
  }));

  router.post("/api/projects", asyncRoute(async (request, response) => {
    const input = createSchema.parse(request.body);
    const project = await projects.create(
      request.livingBlueprintSession.id,
      redirectUrl(request),
      input
    );
    response.status(201).json({ project });
  }));

  router.post("/api/projects/:projectId/update", asyncRoute(async (request, response) => {
    const input = updateSchema.parse(request.body);
    const project = await projects.update(
      request.livingBlueprintSession.id,
      redirectUrl(request),
      request.params.projectId,
      input.changeDescription
    );
    response.json({ project });
  }));

  router.post("/api/projects/:projectId/inspect", asyncRoute(async (request, response) => {
    const project = await projects.inspect(
      request.livingBlueprintSession.id,
      redirectUrl(request),
      request.params.projectId
    );
    response.json({ project });
  }));

  router.post("/api/projects/:projectId/publish", asyncRoute(async (request, response) => {
    const project = await projects.publish(
      request.livingBlueprintSession.id,
      redirectUrl(request),
      request.params.projectId
    );
    response.json({ project });
  }));

  router.post("/api/projects/:projectId/publish-status", asyncRoute(async (request, response) => {
    const project = await projects.refreshPublication(
      request.livingBlueprintSession.id,
      redirectUrl(request),
      request.params.projectId
    );
    response.json({ project });
  }));

  router.delete("/api/projects/:projectId", asyncRoute(async (request, response) => {
    const removed = await projects.repository.remove(
      request.livingBlueprintSession.id,
      request.params.projectId
    );
    response.status(removed ? 204 : 404).end();
  }));

  router.get("/api/replit/apps", asyncRoute(async (request, response) => {
    response.json({ apps: await projects.listReplitApps(
      request.livingBlueprintSession.id,
      redirectUrl(request)
    ) });
  }));

  router.use((error, _request, response, next) => {
    if (error instanceof z.ZodError) {
      response.status(400).json({ error: error.issues[0]?.message || "The request is invalid." });
      return;
    }
    if (error instanceof ReplitConnectionRequiredError) {
      response.status(401).json({ error: error.message, code: "REPLIT_CONNECTION_REQUIRED" });
      return;
    }
    next(error);
  });

  return router;
}
