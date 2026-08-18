import { createHash, randomBytes, randomUUID } from "node:crypto";

function hashCode(code) {
  return createHash("sha256").update(code).digest("hex");
}

function runtimeOrigin(runtimeUrl) {
  const url = new URL(runtimeUrl);
  const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  if (url.protocol !== "https:" && !(local && url.protocol === "http:")) {
    throw new Error("The runtime URL must use HTTPS.");
  }
  return url.origin;
}

export class PairingService {
  constructor(options) {
    this.documents = options.documentStore;
    this.repository = options.repository;
    this.tokens = options.tokens;
    this.now = options.now || Date.now;
    this.pairingTtlMs = options.pairingTtlMs || 5 * 60 * 1000;
    this.tokenTtlMs = options.tokenTtlMs || 30 * 60 * 1000;
  }

  async issue(sessionId, projectId, inputRuntimeUrl) {
    const project = await this.repository.get(sessionId, projectId);
    if (!project) throw new Error("Project not found.");
    const origin = runtimeOrigin(inputRuntimeUrl || project.runtimeUrl || "");
    if (project.runtimeUrl && new URL(project.runtimeUrl).origin !== origin) {
      throw new Error("The runtime origin does not match the URL returned by Replit.");
    }
    const code = randomBytes(32).toString("base64url");
    const expiresAt = this.now() + this.pairingTtlMs;
    await this.documents.put("pairings", hashCode(code), {
      sessionId,
      projectId,
      versionId: project.currentVersionId,
      runtimeOrigin: origin,
      expiresAt
    }, { expiresAt });
    await this.repository.save(sessionId, {
      ...project,
      runtimeUrl: inputRuntimeUrl || project.runtimeUrl,
      runtimeOrigin: origin,
      pairingStatus: "waiting"
    });
    return { code, projectId, versionId: project.currentVersionId, runtimeOrigin: origin, expiresAt };
  }

  async exchange(code, origin) {
    const record = await this.documents.take("pairings", hashCode(String(code || "")));
    if (!record) throw new Error("This pairing code is invalid, expired, or already used.");
    if (record.runtimeOrigin !== origin) throw new Error("The app origin does not match this pairing.");
    if (record.expiresAt <= this.now()) throw new Error("This pairing code has expired.");
    const jti = randomUUID();
    const expiresAt = this.now() + this.tokenTtlMs;
    const claims = {
      typ: "trace_ingest",
      scope: "trace:write",
      jti,
      projectId: record.projectId,
      versionId: record.versionId,
      runtimeOrigin: record.runtimeOrigin,
      iat: Math.floor(this.now() / 1000),
      exp: Math.floor(expiresAt / 1000)
    };
    await this.documents.put("trace_tokens", jti, {
      ...claims,
      sessionId: record.sessionId,
      expiresAt
    }, { expiresAt });
    const project = await this.repository.get(record.sessionId, record.projectId);
    if (project) {
      await this.repository.save(record.sessionId, {
        ...project,
        pairingStatus: "connected"
      });
    }
    return { token: this.tokens.sign(claims), expiresAt, projectId: record.projectId };
  }

  async verify(token, origin) {
    const claims = this.tokens.verify(token);
    if (claims.typ !== "trace_ingest" || claims.scope !== "trace:write") {
      throw new Error("Trace token has the wrong scope.");
    }
    if (claims.runtimeOrigin !== origin) throw new Error("Trace token origin does not match.");
    const active = await this.documents.get("trace_tokens", claims.jti);
    if (!active) throw new Error("Trace token was revoked.");
    return claims;
  }

  async revokeProject(sessionId, projectId) {
    const project = await this.repository.get(sessionId, projectId);
    if (!project) throw new Error("Project not found.");
    const tokens = await this.documents.list("trace_tokens");
    await Promise.all(tokens
      .filter((entry) => entry.value.projectId === projectId && entry.value.sessionId === sessionId)
      .map((entry) => this.documents.delete("trace_tokens", entry.key)));
    await this.repository.save(sessionId, { ...project, pairingStatus: "disconnected" });
  }
}
