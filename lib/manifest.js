import { createHash } from "node:crypto";

import { z } from "zod";

const metadataValue = z.union([z.string().max(240), z.number(), z.boolean()]);

export const manifestNodeSchema = z.object({
  id: z.string().min(3).max(180),
  kind: z.enum(["component", "route", "table", "ai", "websocket", "service"]),
  label: z.string().min(1).max(100),
  evidence: z.enum(["agent_declared", "runtime_observed"]).default("agent_declared"),
  sourceFile: z.string().max(240).optional(),
  metadata: z.record(z.string(), metadataValue).default({})
}).strict();

export const manifestEdgeSchema = z.object({
  id: z.string().min(3).max(360),
  source: z.string().min(3).max(180),
  target: z.string().min(3).max(180),
  relationship: z.enum(["calls", "reads", "writes", "publishes", "subscribes", "renders", "invokes"]),
  evidence: z.enum(["agent_declared", "runtime_observed"]).default("agent_declared")
}).strict();

export const manifestSchema = z.object({
  schemaVersion: z.literal("1"),
  appId: z.uuid(),
  versionId: z.uuid(),
  name: z.string().min(1).max(100),
  summary: z.string().min(1).max(300),
  nodes: z.array(manifestNodeSchema).max(200),
  edges: z.array(manifestEdgeSchema).max(400)
}).strict();

function unique(items, field, label) {
  const values = new Set();
  for (const item of items) {
    if (values.has(item[field])) throw new Error(`${label} IDs must be unique.`);
    values.add(item[field]);
  }
  return values;
}

export function validateManifest(candidate, expected = {}) {
  const manifest = manifestSchema.parse(candidate);
  if (expected.appId && manifest.appId !== expected.appId) {
    throw new Error("The manifest app ID does not match this project.");
  }
  if (expected.versionId && manifest.versionId !== expected.versionId) {
    throw new Error("The manifest version ID does not match the current build.");
  }

  const nodeIds = unique(manifest.nodes, "id", "Node");
  unique(manifest.edges, "id", "Connection");
  for (const edge of manifest.edges) {
    if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) {
      throw new Error(`Connection ${edge.id} points to a node that is not in the manifest.`);
    }
  }
  return manifest;
}

function structuralManifest(manifest) {
  return {
    schemaVersion: manifest.schemaVersion,
    appId: manifest.appId,
    name: manifest.name,
    summary: manifest.summary,
    nodes: manifest.nodes
      .map(({ evidence: _evidence, sourceFile: _sourceFile, ...node }) => node)
      .sort((left, right) => left.id.localeCompare(right.id)),
    edges: manifest.edges
      .map(({ evidence: _evidence, ...edge }) => edge)
      .sort((left, right) => left.id.localeCompare(right.id))
  };
}

export function manifestHash(manifest) {
  return createHash("sha256")
    .update(JSON.stringify(structuralManifest(manifest)))
    .digest("hex");
}

function changedById(beforeItems, afterItems) {
  const before = new Map(beforeItems.map((item) => [item.id, item]));
  const after = new Map(afterItems.map((item) => [item.id, item]));
  const added = [...after.keys()].filter((id) => !before.has(id));
  const removed = [...before.keys()].filter((id) => !after.has(id));
  const changed = [...after.keys()].filter(
    (id) => before.has(id) && JSON.stringify(before.get(id)) !== JSON.stringify(after.get(id))
  );
  return { added, removed, changed };
}

export function diffManifests(beforeManifest, afterManifest) {
  if (!beforeManifest) {
    return {
      nodes: { added: afterManifest.nodes.map((node) => node.id), removed: [], changed: [] },
      edges: { added: afterManifest.edges.map((edge) => edge.id), removed: [], changed: [] }
    };
  }
  const before = structuralManifest(beforeManifest);
  const after = structuralManifest(afterManifest);
  return {
    nodes: changedById(before.nodes, after.nodes),
    edges: changedById(before.edges, after.edges)
  };
}

export function parseManifestText(text) {
  if (typeof text !== "string") throw new Error("Replit did not return manifest text.");
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const source = fenced ? fenced[1].trim() : trimmed;
  try {
    return JSON.parse(source);
  } catch {
    const start = source.indexOf("{");
    const end = source.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(source.slice(start, end + 1));
    throw new Error("Replit returned a manifest that was not valid JSON.");
  }
}
