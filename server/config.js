function replitOrigin(environment) {
  const domain = String(environment.REPLIT_DOMAINS || "")
    .split(",")
    .map((value) => value.trim())
    .find(Boolean);
  return domain ? `https://${domain}` : "";
}

export function loadRuntimeConfig(environment = process.env) {
  const production = environment.NODE_ENV === "production" || environment.REPLIT_DEPLOYMENT === "1";
  const publicOrigin = String(environment.PUBLIC_ORIGIN || replitOrigin(environment)).replace(/\/$/, "");
  const sessionSecret = environment.SESSION_SECRET || (production ? "" : "living-blueprint-local-development");
  const databaseUrl = environment.DATABASE_URL || "";

  if (sessionSecret && sessionSecret.length < 16) {
    throw new Error("SESSION_SECRET must contain at least 16 characters.");
  }
  if (publicOrigin) {
    const parsed = new URL(publicOrigin);
    const local = parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1";
    if (parsed.protocol !== "https:" && !(local && parsed.protocol === "http:")) {
      throw new Error("PUBLIC_ORIGIN must use HTTPS outside local development.");
    }
  }
  if (production) {
    const missing = [
      !sessionSecret && "SESSION_SECRET",
      !databaseUrl && "DATABASE_URL",
      !publicOrigin && "PUBLIC_ORIGIN or REPLIT_DOMAINS"
    ].filter(Boolean);
    if (missing.length) throw new Error(`Production configuration is missing: ${missing.join(", ")}.`);
  }

  return {
    production,
    publicOrigin,
    sessionSecret,
    databaseUrl,
    sourceReplId: environment.SOURCE_REPL_ID || ""
  };
}
