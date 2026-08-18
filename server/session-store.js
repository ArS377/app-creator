import { randomUUID } from "node:crypto";

export const sessionCookieName = "living_blueprint_session";
const sessionIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function parseCookies(cookieHeader = "") {
  return Object.fromEntries(
    cookieHeader
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const separator = part.indexOf("=");
        if (separator < 0) return [part, ""];
        try {
          return [part.slice(0, separator), decodeURIComponent(part.slice(separator + 1))];
        } catch {
          return [part.slice(0, separator), ""];
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
