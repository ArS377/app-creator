import { createHmac, timingSafeEqual } from "node:crypto";

function encode(value) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function decode(value) {
  return JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
}

export function createSignedTokenService(secret, options = {}) {
  if (!secret || secret.length < 16) throw new Error("SESSION_SECRET must contain at least 16 characters.");
  const now = options.now || Date.now;

  function signature(value) {
    return createHmac("sha256", secret).update(value).digest("base64url");
  }

  return {
    sign(claims) {
      const header = encode({ alg: "HS256", typ: "LB1" });
      const payload = encode(claims);
      return `${header}.${payload}.${signature(`${header}.${payload}`)}`;
    },

    verify(token) {
      const [header, payload, submitted] = String(token || "").split(".");
      if (!header || !payload || !submitted) throw new Error("Trace token is malformed.");
      const expected = signature(`${header}.${payload}`);
      const left = Buffer.from(submitted);
      const right = Buffer.from(expected);
      if (left.length !== right.length || !timingSafeEqual(left, right)) {
        throw new Error("Trace token signature is invalid.");
      }
      const headerValue = decode(header);
      const claims = decode(payload);
      if (headerValue.typ !== "LB1" || headerValue.alg !== "HS256") {
        throw new Error("Trace token type is not supported.");
      }
      if (!Number.isFinite(claims.exp) || claims.exp * 1000 <= now()) {
        throw new Error("Trace token has expired.");
      }
      return claims;
    }
  };
}
