import { z } from "zod";

const eventSchema = z.object({
  id: z.string().min(1).max(80).regex(/^[a-zA-Z0-9_.:-]+$/),
  traceId: z.string().min(1).max(80).regex(/^[a-zA-Z0-9_.:-]+$/),
  parentId: z.string().max(80).nullable().optional(),
  timestamp: z.union([z.iso.datetime(), z.number().finite()]),
  durationMs: z.number().finite().min(0).max(300000).default(0),
  kind: z.enum(["ui.action", "http.client", "http.server", "db.query", "ai.call", "ws.publish", "ws.receive", "error", "fault.applied", "background.job"]),
  nodeId: z.string().min(3).max(180),
  routeTemplate: z.string().max(160).optional(),
  operation: z.string().max(80).optional(),
  status: z.string().max(40).optional(),
  errorClass: z.string().max(80).optional()
}).passthrough();

function normalizeRoute(value) {
  if (!value) return undefined;
  const path = value.split("?")[0].slice(0, 140);
  return path
    .replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, ":id")
    .replace(/\/(\d{2,})(?=\/|$)/g, "/:id");
}

export function sanitizeRuntimeEvent(candidate, claims) {
  const input = eventSchema.parse(candidate);
  return {
    id: input.id,
    traceId: input.traceId,
    parentId: input.parentId || null,
    timestamp: typeof input.timestamp === "number"
      ? new Date(input.timestamp).toISOString()
      : input.timestamp,
    durationMs: Math.round(input.durationMs * 100) / 100,
    kind: input.kind,
    nodeId: input.nodeId,
    routeTemplate: normalizeRoute(input.routeTemplate),
    operation: input.operation?.replace(/[^a-zA-Z0-9_.:-]/g, "").slice(0, 80),
    status: input.status?.replace(/[^a-zA-Z0-9_.:-]/g, "").slice(0, 40),
    errorClass: input.errorClass?.replace(/[^a-zA-Z0-9_.:-]/g, "").slice(0, 80),
    source: "browser",
    projectId: claims.projectId,
    versionId: claims.versionId,
    receivedAt: new Date().toISOString()
  };
}

export class TraceStore {
  constructor(options) {
    this.documents = options.documentStore;
    this.now = options.now || Date.now;
    this.retentionMs = options.retentionMs || 7 * 24 * 60 * 60 * 1000;
    this.rate = new Map();
  }

  checkRate(jti) {
    const now = this.now();
    const current = this.rate.get(jti) || { windowStart: now, count: 0, burst: 0 };
    if (now - current.windowStart >= 1000) {
      current.windowStart = now;
      current.count = 0;
      current.burst = Math.max(0, current.burst - 25);
    }
    current.count += 1;
    current.burst += 1;
    this.rate.set(jti, current);
    if (current.count > 25 || current.burst > 100) throw new Error("Trace event rate limit reached.");
  }

  async append(candidate, claims, rawBytes = 0) {
    if (rawBytes > 4096) throw new Error("Trace events must be 4 KB or smaller.");
    this.checkRate(claims.jti);
    const event = sanitizeRuntimeEvent(candidate, claims);
    const namespace = `events:${claims.projectId}:${event.traceId}`;
    if (await this.documents.get(namespace, event.id)) return event;
    const existing = await this.documents.list(namespace);
    if (existing.length >= 256) throw new Error("This trace has reached its 256-event limit.");
    const expiresAt = this.now() + this.retentionMs;
    await this.documents.put(namespace, event.id, event, { expiresAt });
    const summary = await this.documents.get(`traces:${claims.projectId}`, event.traceId) || {
      id: event.traceId,
      projectId: claims.projectId,
      versionId: claims.versionId,
      startedAt: event.timestamp,
      eventCount: 0,
      status: "running"
    };
    summary.eventCount = existing.length + 1;
    summary.updatedAt = event.timestamp;
    if (event.kind === "error" || event.errorClass) summary.status = "error";
    await this.documents.put(`traces:${claims.projectId}`, event.traceId, summary, { expiresAt });
    await this.documents.put(`evidence:${claims.projectId}:${claims.versionId}`, event.nodeId, {
      nodeId: event.nodeId,
      observedAt: event.receivedAt,
      traceId: event.traceId
    }, { expiresAt });
    return event;
  }

  async list(projectId) {
    const traces = await this.documents.list(`traces:${projectId}`);
    return traces.map((entry) => entry.value).sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }

  async detail(projectId, traceId) {
    const summary = await this.documents.get(`traces:${projectId}`, traceId);
    if (!summary) return null;
    const events = (await this.documents.list(`events:${projectId}:${traceId}`))
      .map((entry) => entry.value)
      .sort((left, right) => left.timestamp.localeCompare(right.timestamp));
    return { ...summary, events };
  }

  async evidence(projectId, versionId) {
    return (await this.documents.list(`evidence:${projectId}:${versionId}`)).map((entry) => entry.value);
  }
}
