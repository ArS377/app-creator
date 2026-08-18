import { randomUUID } from "node:crypto";

import { diffManifests, manifestHash, parseManifestText, validateManifest } from "../lib/manifest.js";
import { generationPrompt, manifestQuestion, updatePrompt } from "./instrumentation-contract.js";
import { ReplitToolTimeoutError } from "./replit-mcp.js";
import { findValue, toolResultData, toolResultText } from "./replit-result.js";

function milestone(type, detail) {
  return { type, detail, at: new Date().toISOString() };
}

function cleanName(name, prompt) {
  const candidate = String(name || "").trim();
  if (candidate) return candidate.slice(0, 72);
  return prompt.trim().split(/\s+/).slice(0, 5).join(" ").slice(0, 72) || "Untitled app";
}

function creationDetails(result) {
  const data = toolResultData(result);
  return {
    replId: String(findValue(data, ["replId", "repl_id", "id"]) || ""),
    replUrl: String(findValue(data, ["replUrl", "repl_url", "url"]) || ""),
    turnId: String(findValue(data, ["turnId", "turn_id"]) || ""),
    phase: String(findValue(data, ["phase", "status"]) || "agent_working")
  };
}

function publicationDetails(result) {
  const data = toolResultData(result);
  return {
    status: String(findValue(data, ["publishStatus", "publish_status", "status", "phase"]) || "publishing"),
    runtimeUrl: String(findValue(data, ["publishedUrl", "published_url", "deploymentUrl", "deployment_url", "url"]) || "")
  };
}

export class ProjectService {
  constructor(options) {
    this.repository = options.repository;
    this.replit = options.replit;
    this.sourceReplId = options.sourceReplId || process.env.SOURCE_REPL_ID || "";
  }

  async list(sessionId) {
    return this.repository.list(sessionId);
  }

  async detail(sessionId, projectId) {
    const project = await this.repository.get(sessionId, projectId);
    if (!project) return null;
    const [versions, manifests] = await Promise.all([
      this.repository.listVersions(projectId),
      this.repository.listManifests(projectId)
    ]);
    const currentManifest = manifests.at(-1) || null;
    const previousManifest = manifests.at(-2) || null;
    return {
      ...project,
      versions,
      manifests,
      currentManifest,
      manifestDiff: currentManifest ? diffManifests(previousManifest?.manifest, currentManifest.manifest) : null
    };
  }

  async create(sessionId, redirectUrl, input) {
    const id = randomUUID();
    const versionId = randomUUID();
    const now = new Date().toISOString();
    let project = await this.repository.save(sessionId, {
      id,
      name: cleanName(input.name, input.prompt),
      prompt: input.prompt.trim(),
      status: "creating",
      replId: null,
      replUrl: null,
      runtimeUrl: null,
      currentVersionId: versionId,
      manifestStatus: "missing",
      sourceMode: this.sourceReplId ? "instrumented_source" : "prompt_contract",
      milestones: [milestone("create_requested", "Creation request sent to Replit.")],
      createdAt: now,
      updatedAt: now
    });
    await this.repository.saveVersion(id, {
      id: versionId,
      projectId: id,
      kind: "create",
      prompt: input.prompt.trim(),
      status: "pending",
      createdAt: now
    });

    const argumentsValue = {
      appDescription: generationPrompt(input.prompt, {
        appId: id,
        versionId,
        controlOrigin: new URL(redirectUrl).origin
      }),
      app_stack: "react_website",
      userSpecifiedAppName: project.name
    };
    if (this.sourceReplId) argumentsValue.sourceReplId = this.sourceReplId;

    try {
      const result = await this.replit.callTool(
        sessionId,
        redirectUrl,
        "create_app_from_prompt",
        argumentsValue
      );
      const details = creationDetails(result);
      if (!details.replId) throw new Error("Replit created the app without returning a Repl ID.");
      project = await this.repository.save(sessionId, {
        ...project,
        ...details,
        status: "agent_working",
        milestones: [...project.milestones, milestone("repl_created", "Replit returned the project editor URL.")]
      });
      await this.repository.saveVersion(id, {
        ...(await this.repository.getVersion(id, versionId)),
        status: "agent_working",
        turnId: details.turnId || null
      });
      return project;
    } catch (error) {
      const outcomeUnknown = error instanceof ReplitToolTimeoutError || error.outcomeUnknown;
      project = await this.repository.save(sessionId, {
        ...project,
        status: outcomeUnknown ? "agent_working" : "failed",
        outcomeUnknown: Boolean(outcomeUnknown),
        lastError: outcomeUnknown
          ? "Replit may still be creating this app. Do not send the prompt again yet."
          : error.message,
        milestones: [
          ...project.milestones,
          milestone(outcomeUnknown ? "create_timeout" : "create_failed", error.message)
        ]
      });
      if (!outcomeUnknown) throw error;
      return project;
    }
  }

  async update(sessionId, redirectUrl, projectId, changeDescription) {
    let project = await this.repository.get(sessionId, projectId);
    if (!project?.replId) throw new Error("This project does not have a Replit app yet.");
    const versionId = randomUUID();
    const now = new Date().toISOString();
    await this.repository.saveVersion(projectId, {
      id: versionId,
      projectId,
      kind: "update",
      prompt: changeDescription.trim(),
      status: "pending",
      createdAt: now
    });
    project = await this.repository.save(sessionId, {
      ...project,
      status: "updating",
      currentVersionId: versionId,
      milestones: [...project.milestones, milestone("update_requested", "Update request sent to Replit.")]
    });
    try {
      const result = await this.replit.callTool(sessionId, redirectUrl, "update_app_using_prompt", {
        replId: project.replId,
        changeDescription: updatePrompt(changeDescription, {
          appId: project.id,
          versionId,
          controlOrigin: new URL(redirectUrl).origin
        })
      });
      const data = toolResultData(result);
      const turnId = String(findValue(data, ["turnId", "turn_id"]) || "");
      await this.repository.saveVersion(projectId, {
        ...(await this.repository.getVersion(projectId, versionId)),
        status: "agent_working",
        turnId: turnId || null
      });
      return this.repository.save(sessionId, {
        ...project,
        status: "agent_working",
        outcomeUnknown: false,
        milestones: [...project.milestones, milestone("update_accepted", "Replit Agent is applying the change.")]
      });
    } catch (error) {
      const outcomeUnknown = error instanceof ReplitToolTimeoutError || error.outcomeUnknown;
      const next = await this.repository.save(sessionId, {
        ...project,
        status: outcomeUnknown ? "agent_working" : "failed",
        outcomeUnknown: Boolean(outcomeUnknown),
        lastError: outcomeUnknown
          ? "Replit may still be applying this update. Do not submit it again yet."
          : error.message,
        milestones: [...project.milestones, milestone(outcomeUnknown ? "update_timeout" : "update_failed", error.message)]
      });
      if (!outcomeUnknown) throw error;
      return next;
    }
  }

  async inspect(sessionId, redirectUrl, projectId) {
    let project = await this.repository.get(sessionId, projectId);
    if (!project?.replId) throw new Error("This project does not have a Replit app yet.");
    project = await this.repository.save(sessionId, {
      ...project,
      status: "inspecting",
      manifestStatus: "checking",
      milestones: [...project.milestones, milestone("inspection_requested", "Manifest inspection sent to Replit.")]
    });
    try {
      const result = await this.replit.callTool(sessionId, redirectUrl, "ask_question", {
        replId: project.replId,
        question: manifestQuestion({ appId: project.id, versionId: project.currentVersionId })
      });
      const manifest = validateManifest(parseManifestText(toolResultText(result)), {
        appId: project.id,
        versionId: project.currentVersionId
      });
      const snapshot = {
        versionId: project.currentVersionId,
        hash: manifestHash(manifest),
        manifest,
        createdAt: new Date().toISOString()
      };
      await this.repository.saveManifest(projectId, snapshot);
      const version = await this.repository.getVersion(projectId, project.currentVersionId);
      if (version) await this.repository.saveVersion(projectId, { ...version, status: "inspected" });
      return this.repository.save(sessionId, {
        ...project,
        status: project.runtimeUrl ? "published" : "agent_working",
        manifestStatus: "valid",
        manifestHash: snapshot.hash,
        outcomeUnknown: false,
        milestones: [...project.milestones, milestone("manifest_valid", `${manifest.nodes.length} boundaries validated.`)]
      });
    } catch (error) {
      await this.repository.save(sessionId, {
        ...project,
        status: "agent_working",
        manifestStatus: "invalid",
        lastError: error.message,
        milestones: [...project.milestones, milestone("manifest_invalid", error.message)]
      });
      throw error;
    }
  }

  async publish(sessionId, redirectUrl, projectId) {
    let project = await this.repository.get(sessionId, projectId);
    if (!project?.replId) throw new Error("This project does not have a Replit app yet.");
    project = await this.repository.save(sessionId, {
      ...project,
      status: "publishing",
      milestones: [...project.milestones, milestone("publish_requested", "Publication request sent to Replit.")]
    });
    await this.replit.callTool(sessionId, redirectUrl, "publish_app", { replId: project.replId });
    return this.refreshPublication(sessionId, redirectUrl, projectId);
  }

  async refreshPublication(sessionId, redirectUrl, projectId) {
    const project = await this.repository.get(sessionId, projectId);
    if (!project?.replId) throw new Error("This project does not have a Replit app yet.");
    const result = await this.replit.callTool(sessionId, redirectUrl, "get_publish_status", {
      replId: project.replId
    });
    const details = publicationDetails(result);
    const isPublished = Boolean(details.runtimeUrl) || /published|ready|live/i.test(details.status);
    return this.repository.save(sessionId, {
      ...project,
      status: isPublished ? "published" : "publishing",
      publishStatus: details.status,
      runtimeUrl: details.runtimeUrl || project.runtimeUrl,
      milestones: isPublished && project.status !== "published"
        ? [...project.milestones, milestone("published", "Replit returned the live app URL.")]
        : project.milestones
    });
  }

  async listReplitApps(sessionId, redirectUrl) {
    const result = await this.replit.callTool(sessionId, redirectUrl, "list_apps", { limit: 25 });
    return toolResultData(result);
  }
}
