import { Router } from "express";

function publicOrigin(request) {
  if (process.env.PUBLIC_ORIGIN) return process.env.PUBLIC_ORIGIN.replace(/\/$/, "");
  const protocol = String(request.headers["x-forwarded-proto"] || request.protocol).split(",")[0].trim();
  return `${protocol}://${request.get("host")}`;
}

export function createReplitRouter(replit) {
  const router = Router();

  router.get("/api/replit/connection", async (request, response, next) => {
    try {
      response.json(await replit.status(request.livingBlueprintSession.id));
    } catch (error) {
      next(error);
    }
  });

  router.get("/auth/replit/start", async (request, response, next) => {
    try {
      const redirectUrl = `${publicOrigin(request)}/auth/replit/callback`;
      const result = await replit.beginAuthorization(request.livingBlueprintSession.id, redirectUrl);
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
      const redirectUrl = `${publicOrigin(request)}/auth/replit/callback`;
      await replit.finishAuthorization(request.livingBlueprintSession.id, redirectUrl, {
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
      await replit.disconnect(request.livingBlueprintSession.id);
      response.status(204).end();
    } catch (error) {
      next(error);
    }
  });

  return router;
}
