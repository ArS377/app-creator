import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { randomUUID } from "node:crypto";

import { investigateTrace } from "./lib/investigator.js";

const root = join(fileURLToPath(new URL(".", import.meta.url)), "public");
const port = Number.parseInt(process.env.PORT || "3000", 10);
const sessionCookieName = "living_blueprint_session";
const sessionIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml"
};

export function parseCookies(cookieHeader = "") {
  return Object.fromEntries(
    cookieHeader
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const separator = part.indexOf("=");
        if (separator < 0) return [part, ""];
        const name = part.slice(0, separator);
        try {
          return [name, decodeURIComponent(part.slice(separator + 1))];
        } catch {
          return [name, ""];
        }
      })
  );
}

export function createSessionStore(options = {}) {
  const ttlMs = options.ttlMs || 30 * 60 * 1000;
  const rateWindowMs = options.rateWindowMs || 60 * 1000;
  const rateLimit = options.rateLimit || 15;
  const now = options.now || Date.now;
  const sessions = new Map();

  function ensure(cookieHeader = "") {
    const candidateId = parseCookies(cookieHeader)[sessionCookieName];
    const existing = sessionIdPattern.test(candidateId || "") ? sessions.get(candidateId) : null;
    const currentTime = now();

    if (existing && existing.expiresAt > currentTime) {
      existing.expiresAt = currentTime + ttlMs;
      return { id: candidateId, isNew: false };
    }

    const id = randomUUID();
    sessions.set(id, { expiresAt: currentTime + ttlMs, investigatorCalls: [] });
    return { id, isNew: true };
  }

  function consumeInvestigatorCall(id) {
    const session = sessions.get(id);
    if (!session) return false;

    const cutoff = now() - rateWindowMs;
    session.investigatorCalls = session.investigatorCalls.filter((timestamp) => timestamp > cutoff);
    if (session.investigatorCalls.length >= rateLimit) return false;

    session.investigatorCalls.push(now());
    return true;
  }

  function prune() {
    const currentTime = now();
    for (const [id, session] of sessions) {
      if (session.expiresAt <= currentTime) sessions.delete(id);
    }
  }

  return {
    ensure,
    consumeInvestigatorCall,
    prune,
    get size() {
      return sessions.size;
    }
  };
}

function resolvePublicPath(pathname) {
  try {
    const requestedPath = pathname === "/" ? "/index.html" : pathname;
    const cleanPath = normalize(decodeURIComponent(requestedPath)).replace(/^(\.\.[/\\])+/, "");
    const filePath = join(root, cleanPath);
    return filePath.startsWith(root) ? filePath : null;
  } catch {
    return null;
  }
}

function setSecurityHeaders(response, requestId) {
  response.setHeader("content-security-policy", [
    "default-src 'self'",
    "base-uri 'self'",
    "connect-src 'self'",
    "font-src 'self'",
    "form-action 'self'",
    "frame-ancestors 'self' https://replit.com https://*.replit.com https://*.replit.dev https://*.replit.app",
    "img-src 'self' data:",
    "object-src 'none'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'"
  ].join("; "));
  response.setHeader("permissions-policy", "camera=(), microphone=(), geolocation=()");
  response.setHeader("referrer-policy", "no-referrer");
  response.setHeader("x-content-type-options", "nosniff");
  response.setHeader("x-request-id", requestId);
}

function setSessionCookie(response, sessionId, secure) {
  response.setHeader(
    "set-cookie",
    `${sessionCookieName}=${sessionId}; Path=/; HttpOnly; SameSite=Lax; Max-Age=1800${secure ? "; Secure" : ""}`
  );
}

function sendJson(response, statusCode, body, extraHeaders = {}) {
  response.writeHead(statusCode, {
    "cache-control": "no-store",
    "content-type": "application/json; charset=utf-8",
    ...extraHeaders
  });
  response.end(JSON.stringify(body));
}

function readJson(request, maximumBytes = 64 * 1024) {
  return new Promise((resolve, reject) => {
    let body = "";
    let settled = false;

    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      if (settled) return;
      body += chunk;
      if (Buffer.byteLength(body) > maximumBytes) {
        settled = true;
        reject(new Error("Request body is too large."));
      }
    });
    request.on("end", () => {
      if (settled) return;
      try {
        settled = true;
        resolve(JSON.parse(body));
      } catch {
        settled = true;
        reject(new Error("Request body must be valid JSON."));
      }
    });
    request.on("error", (error) => {
      if (!settled) reject(error);
      settled = true;
    });
  });
}

export function createLivingBlueprintServer(options = {}) {
  const sessionStore = options.sessionStore || createSessionStore();
  const investigator = options.investigator || investigateTrace;
  const healthStartedAt = Date.now();
  const pruneTimer = setInterval(() => sessionStore.prune(), 5 * 60 * 1000);
  pruneTimer.unref();

  const server = createServer(async (request, response) => {
    const requestId = randomUUID();
    const url = new URL(request.url || "/", "http://living-blueprint.local");
    const session = sessionStore.ensure(request.headers.cookie || "");
    const isSecure =
      process.env.REPLIT_DEPLOYMENT === "1" ||
      String(request.headers["x-forwarded-proto"] || "").split(",")[0].trim() === "https";

    setSecurityHeaders(response, requestId);
    if (session.isNew) setSessionCookie(response, session.id, isSecure);

    if (request.method === "GET" && url.pathname === "/api/health") {
      sendJson(response, 200, {
        status: "ok",
        service: "living-blueprint",
        investigator: process.env.OPENAI_API_KEY && process.env.OPENAI_MODEL ? "ai-ready" : "local-fallback",
        uptimeSeconds: Math.floor((Date.now() - healthStartedAt) / 1000)
      });
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/investigate") {
      if (!sessionStore.consumeInvestigatorCall(session.id)) {
        sendJson(
          response,
          429,
          { error: "Investigator rate limit reached for this session." },
          { "retry-after": "60" }
        );
        return;
      }

      try {
        const body = await readJson(request);
        const diagnosis = await investigator(body.trace);
        sendJson(response, 200, diagnosis);
      } catch (error) {
        sendJson(response, 400, { error: error.message });
      }
      return;
    }

    if (url.pathname.startsWith("/api/")) {
      sendJson(response, 404, { error: "API route not found." });
      return;
    }

    if (request.method !== "GET" && request.method !== "HEAD") {
      response.writeHead(405, {
        allow: "GET, HEAD",
        "content-type": "text/plain; charset=utf-8"
      });
      response.end("Method not allowed");
      return;
    }

    const filePath = resolvePublicPath(url.pathname);
    if (!filePath || !existsSync(filePath) || !statSync(filePath).isFile()) {
      response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      response.end("Not found");
      return;
    }

    response.writeHead(200, {
      "cache-control": extname(filePath) === ".html" ? "no-store" : "public, max-age=300",
      "content-type": contentTypes[extname(filePath)] || "application/octet-stream"
    });
    if (request.method === "HEAD") response.end();
    else createReadStream(filePath).pipe(response);
  });

  server.on("close", () => clearInterval(pruneTimer));
  server.on("clientError", (_error, socket) => {
    socket.end("HTTP/1.1 400 Bad Request\r\n\r\n");
  });

  return server;
}

const executedFile = process.argv[1] ? pathToFileURL(process.argv[1]).href : "";
if (import.meta.url === executedFile) {
  const server = createLivingBlueprintServer();
  server.listen(port, "0.0.0.0", () => {
    console.log(`Living Blueprint is running on http://0.0.0.0:${port}`);
  });
}
