import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

import express from "express";

import { investigateTrace } from "../lib/investigator.js";
import { createCryptoVault, EncryptedCredentialStore } from "./crypto-vault.js";
import { createDocumentStore } from "./document-store.js";
import { createProjectRouter } from "./project-routes.js";
import { ProjectRepository } from "./project-repository.js";
import { ProjectService } from "./project-service.js";
import { ReplitMcpService } from "./replit-mcp.js";
import { createReplitRouter } from "./replit-routes.js";
import { createSessionStore, sessionCookieName } from "./session-store.js";

const projectRoot = fileURLToPath(new URL("..", import.meta.url));

function securityHeaders(_request, response, next) {
  response.setHeader("content-security-policy", [
    "default-src 'self'",
    "base-uri 'self'",
    "connect-src 'self' ws: wss:",
    "font-src 'self'",
    "form-action 'self'",
    "frame-ancestors 'self' https://replit.com https://*.replit.com https://*.replit.dev https://*.replit.app",
    "img-src 'self' data: https:",
    "object-src 'none'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'"
  ].join("; "));
  response.setHeader("permissions-policy", "camera=(), microphone=(), geolocation=()");
  response.setHeader("referrer-policy", "strict-origin-when-cross-origin");
  response.setHeader("x-content-type-options", "nosniff");
  response.setHeader("x-request-id", randomUUID());
  next();
}

function sessionMiddleware(sessionStore) {
  return (request, response, next) => {
    const session = sessionStore.ensure(request.headers.cookie || "");
    request.livingBlueprintSession = session;
    if (session.isNew) {
      const secure =
        process.env.REPLIT_DEPLOYMENT === "1" ||
        String(request.headers["x-forwarded-proto"] || "").split(",")[0].trim() === "https";
      response.cookie(sessionCookieName, session.id, {
        httpOnly: true,
        maxAge: 30 * 60 * 1000,
        sameSite: "lax",
        secure
      });
    }
    next();
  };
}

export async function createLivingBlueprintApp(options = {}) {
  const app = express();
  const sessionStore = options.sessionStore || createSessionStore();
  const documentStore = options.documentStore || createDocumentStore();
  const investigator = options.investigator || investigateTrace;
  const vault = options.vault || createCryptoVault(
    process.env.SESSION_SECRET || "living-blueprint-local-development"
  );
  const credentials = options.credentials || new EncryptedCredentialStore(documentStore, vault);
  const replit = options.replit || new ReplitMcpService({ credentials });
  const projectRepository = options.projectRepository || new ProjectRepository(documentStore);
  const projects = options.projects || new ProjectService({ repository: projectRepository, replit });
  const healthStartedAt = Date.now();

  await documentStore.init();
  app.locals.documentStore = documentStore;
  app.locals.sessionStore = sessionStore;
  app.locals.replit = replit;
  app.locals.projects = projects;

  app.disable("x-powered-by");
  app.use(securityHeaders);
  app.use(sessionMiddleware(sessionStore));
  app.use(express.json({ limit: "64kb", strict: true }));
  app.use(createReplitRouter(replit));
  app.use(createProjectRouter(projects));

  app.get("/api/health", (_request, response) => {
    response.json({
      status: "ok",
      service: "living-blueprint",
      version: "1.0.0",
      persistence: process.env.DATABASE_URL ? "postgres" : "memory",
      investigator: process.env.OPENAI_API_KEY && process.env.OPENAI_MODEL ? "ai-ready" : "local-fallback",
      uptimeSeconds: Math.floor((Date.now() - healthStartedAt) / 1000)
    });
  });

  app.post("/api/investigate", async (request, response) => {
    const sessionId = request.livingBlueprintSession.id;
    if (!sessionStore.consumeInvestigatorCall(sessionId)) {
      response.setHeader("retry-after", "60");
      response.status(429).json({ error: "This session has reached the investigator limit." });
      return;
    }

    try {
      response.json(await investigator(request.body.trace));
    } catch (error) {
      response.status(400).json({ error: error.message });
    }
  });

  app.use("/api", (_request, response) => {
    response.status(404).json({ error: "API route not found." });
  });

  const builtClient = join(projectRoot, "dist");
  const staticRoot = existsSync(builtClient) ? builtClient : join(projectRoot, "public");
  app.use(express.static(staticRoot, { etag: true, index: "index.html" }));
  app.get("/*splat", (_request, response) => response.sendFile(join(staticRoot, "index.html")));

  app.use((error, _request, response, _next) => {
    const status = error?.type === "entity.too.large" || error instanceof SyntaxError ? 400 : 500;
    response.status(status).json({
      error: status === 400 ? "Request body must be valid JSON under 64 KB." : "The server could not complete this request."
    });
  });

  return app;
}
