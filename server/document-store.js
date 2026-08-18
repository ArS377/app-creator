import pg from "pg";

const { Pool } = pg;

export class MemoryDocumentStore {
  constructor(options = {}) {
    this.documents = new Map();
    this.now = options.now || Date.now;
  }

  async init() {}

  async close() {}

  async get(namespace, key) {
    const document = this.documents.get(`${namespace}:${key}`);
    if (!document) return null;
    if (document.expiresAt && document.expiresAt <= this.now()) {
      this.documents.delete(`${namespace}:${key}`);
      return null;
    }
    return structuredClone(document.value);
  }

  async put(namespace, key, value, options = {}) {
    this.documents.set(`${namespace}:${key}`, {
      namespace,
      key,
      value: structuredClone(value),
      expiresAt: options.expiresAt || null,
      updatedAt: this.now()
    });
    return structuredClone(value);
  }

  async delete(namespace, key) {
    return this.documents.delete(`${namespace}:${key}`);
  }

  async list(namespace) {
    const values = [];
    for (const document of this.documents.values()) {
      if (document.namespace !== namespace) continue;
      if (document.expiresAt && document.expiresAt <= this.now()) continue;
      values.push({ key: document.key, value: structuredClone(document.value) });
    }
    return values;
  }

  async prune() {
    for (const [key, document] of this.documents) {
      if (document.expiresAt && document.expiresAt <= this.now()) this.documents.delete(key);
    }
  }
}

export class PostgresDocumentStore {
  constructor(connectionString, options = {}) {
    this.pool = options.pool || new Pool({ connectionString, max: 5 });
  }

  async init() {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS living_blueprint_documents (
        namespace TEXT NOT NULL,
        key TEXT NOT NULL,
        value JSONB NOT NULL,
        expires_at TIMESTAMPTZ,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (namespace, key)
      )
    `);
    await this.pool.query(`
      CREATE INDEX IF NOT EXISTS living_blueprint_documents_expiry
      ON living_blueprint_documents (expires_at)
      WHERE expires_at IS NOT NULL
    `);
  }

  async close() {
    await this.pool.end();
  }

  async get(namespace, key) {
    const result = await this.pool.query(
      `SELECT value FROM living_blueprint_documents
       WHERE namespace = $1 AND key = $2 AND (expires_at IS NULL OR expires_at > NOW())`,
      [namespace, key]
    );
    return result.rows[0]?.value || null;
  }

  async put(namespace, key, value, options = {}) {
    await this.pool.query(
      `INSERT INTO living_blueprint_documents (namespace, key, value, expires_at)
       VALUES ($1, $2, $3::jsonb, $4)
       ON CONFLICT (namespace, key) DO UPDATE
       SET value = EXCLUDED.value, expires_at = EXCLUDED.expires_at, updated_at = NOW()`,
      [namespace, key, JSON.stringify(value), options.expiresAt ? new Date(options.expiresAt) : null]
    );
    return value;
  }

  async delete(namespace, key) {
    const result = await this.pool.query(
      "DELETE FROM living_blueprint_documents WHERE namespace = $1 AND key = $2",
      [namespace, key]
    );
    return result.rowCount > 0;
  }

  async list(namespace) {
    const result = await this.pool.query(
      `SELECT key, value FROM living_blueprint_documents
       WHERE namespace = $1 AND (expires_at IS NULL OR expires_at > NOW())
       ORDER BY updated_at DESC`,
      [namespace]
    );
    return result.rows;
  }

  async prune() {
    await this.pool.query(
      "DELETE FROM living_blueprint_documents WHERE expires_at IS NOT NULL AND expires_at <= NOW()"
    );
  }
}

export function createDocumentStore(options = {}) {
  const connectionString = options.connectionString || process.env.DATABASE_URL;
  return connectionString
    ? new PostgresDocumentStore(connectionString, options)
    : new MemoryDocumentStore(options);
}
