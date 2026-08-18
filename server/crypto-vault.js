import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

function deriveKey(secret) {
  if (!secret || secret.length < 16) {
    throw new Error("SESSION_SECRET must contain at least 16 characters.");
  }
  return createHash("sha256").update(secret, "utf8").digest();
}

export function createCryptoVault(secret) {
  const key = deriveKey(secret);

  return {
    seal(value, context) {
      const iv = randomBytes(12);
      const cipher = createCipheriv("aes-256-gcm", key, iv);
      cipher.setAAD(Buffer.from(context, "utf8"));
      const ciphertext = Buffer.concat([
        cipher.update(JSON.stringify(value), "utf8"),
        cipher.final()
      ]);
      return {
        algorithm: "A256GCM",
        iv: iv.toString("base64url"),
        tag: cipher.getAuthTag().toString("base64url"),
        ciphertext: ciphertext.toString("base64url")
      };
    },

    open(envelope, context) {
      if (!envelope || envelope.algorithm !== "A256GCM") {
        throw new Error("Encrypted record format is not supported.");
      }
      const decipher = createDecipheriv(
        "aes-256-gcm",
        key,
        Buffer.from(envelope.iv, "base64url")
      );
      decipher.setAAD(Buffer.from(context, "utf8"));
      decipher.setAuthTag(Buffer.from(envelope.tag, "base64url"));
      const plaintext = Buffer.concat([
        decipher.update(Buffer.from(envelope.ciphertext, "base64url")),
        decipher.final()
      ]);
      return JSON.parse(plaintext.toString("utf8"));
    }
  };
}

export class EncryptedCredentialStore {
  constructor(documentStore, vault) {
    this.documents = documentStore;
    this.vault = vault;
  }

  namespace(sessionId) {
    return `oauth:${sessionId}`;
  }

  context(sessionId) {
    return `living-blueprint:oauth:${sessionId}:replit`;
  }

  async get(sessionId) {
    const envelope = await this.documents.get(this.namespace(sessionId), "replit");
    if (!envelope) return {};
    return this.vault.open(envelope, this.context(sessionId));
  }

  async put(sessionId, value) {
    const envelope = this.vault.seal(value, this.context(sessionId));
    await this.documents.put(this.namespace(sessionId), "replit", envelope);
    return value;
  }

  async patch(sessionId, changes) {
    const current = await this.get(sessionId);
    const next = { ...current, ...changes };
    for (const [key, value] of Object.entries(next)) {
      if (value === undefined) delete next[key];
    }
    return this.put(sessionId, next);
  }

  async delete(sessionId) {
    return this.documents.delete(this.namespace(sessionId), "replit");
  }
}
