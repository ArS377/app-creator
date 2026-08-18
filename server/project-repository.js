export class ProjectRepository {
  constructor(documentStore) {
    this.documents = documentStore;
  }

  projectNamespace(sessionId) {
    return `projects:${sessionId}`;
  }

  async list(sessionId) {
    const entries = await this.documents.list(this.projectNamespace(sessionId));
    return entries
      .map((entry) => entry.value)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }

  async get(sessionId, projectId) {
    return this.documents.get(this.projectNamespace(sessionId), projectId);
  }

  async save(sessionId, project) {
    const next = { ...project, updatedAt: new Date().toISOString() };
    await this.documents.put(this.projectNamespace(sessionId), project.id, next);
    return next;
  }

  async remove(sessionId, projectId) {
    const project = await this.get(sessionId, projectId);
    if (!project) return false;

    const [versions, manifests, traces, tokens, pairings] = await Promise.all([
      this.documents.list(`versions:${projectId}`),
      this.documents.list(`manifests:${projectId}`),
      this.documents.list(`traces:${projectId}`),
      this.documents.list("trace_tokens"),
      this.documents.list("pairings")
    ]);

    for (const trace of traces) {
      const events = await this.documents.list(`events:${projectId}:${trace.key}`);
      await Promise.all(events.map((event) =>
        this.documents.delete(`events:${projectId}:${trace.key}`, event.key)
      ));
    }
    for (const version of versions) {
      const evidence = await this.documents.list(`evidence:${projectId}:${version.key}`);
      await Promise.all(evidence.map((entry) =>
        this.documents.delete(`evidence:${projectId}:${version.key}`, entry.key)
      ));
    }

    await Promise.all([
      this.documents.delete(this.projectNamespace(sessionId), projectId),
      ...versions.map((entry) => this.documents.delete(`versions:${projectId}`, entry.key)),
      ...manifests.map((entry) => this.documents.delete(`manifests:${projectId}`, entry.key)),
      ...traces.map((entry) => this.documents.delete(`traces:${projectId}`, entry.key)),
      ...tokens
        .filter((entry) => entry.value.projectId === projectId)
        .map((entry) => this.documents.delete("trace_tokens", entry.key)),
      ...pairings
        .filter((entry) => entry.value.projectId === projectId)
        .map((entry) => this.documents.delete("pairings", entry.key))
    ]);
    return true;
  }

  async saveVersion(projectId, version) {
    await this.documents.put(`versions:${projectId}`, version.id, version);
    return version;
  }

  async getVersion(projectId, versionId) {
    return this.documents.get(`versions:${projectId}`, versionId);
  }

  async listVersions(projectId) {
    const entries = await this.documents.list(`versions:${projectId}`);
    return entries.map((entry) => entry.value).sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  }

  async saveManifest(projectId, snapshot) {
    await this.documents.put(`manifests:${projectId}`, snapshot.versionId, snapshot);
    return snapshot;
  }

  async listManifests(projectId) {
    const entries = await this.documents.list(`manifests:${projectId}`);
    return entries.map((entry) => entry.value).sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  }
}
