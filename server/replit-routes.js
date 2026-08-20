import { Router } from "express";

function publicOrigin(request, configuredOrigin) {
  if (configuredOrigin) return configuredOrigin.replace(/\/$/, "");
  const protocol = String(request.headers["x-forwarded-proto"] || request.protocol).split(",")[0].trim();
  return `${protocol}://${request.get("host")}`;
}

export function createReplitRouter(replit, options = {}) {
  const router = Router();

  router.get("/api/replit/connection", async (request, response, next) => {
    try {
      response.json(await replit.status(request.bluePrintedSession.id));
    } catch (error) {
      next(error);
    }
  });

  router.get("/auth/replit/start", async (request, response, next) => {
    try {
      const redirectUrl = `${publicOrigin(request, options.publicOrigin)}/auth/replit/callback`;
      const result = await replit.beginAuthorization(request.bluePrintedSession.id, redirectUrl);
      response.redirect(result.connected ? "/?replit=connected" : result.authorizationUrl);
    } catch (error) {
      next(error);
    }
  });

  router.get("/auth/replit/callback", async (request, response) => {
    if (request.query.error) {
      response.redirect(`/?replit=error&reason=${encodeURIComponent(String(request.query.error))}`);
      return;
    }

    try {
      const redirectUrl = `${publicOrigin(request, options.publicOrigin)}/auth/replit/callback`;
      await replit.finishAuthorization(request.bluePrintedSession.id, redirectUrl, {
        code: String(request.query.code || ""),
        state: String(request.query.state || "")
      });
      response.redirect("/?replit=connected");
    } catch (error) {
      response.redirect(`/?replit=error&reason=${encodeURIComponent(error.message)}`);
    }
  });

  router.post("/api/replit/disconnect", async (request, response, next) => {
    try {
      await options.onDisconnect?.(request.bluePrintedSession.id);
      await replit.disconnect(request.bluePrintedSession.id);
      response.status(204).end();
    } catch (error) {
      next(error);
    }
  });

  return router;
}
