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
    await Promise.all([
      this.documents.delete(this.projectNamespace(sessionId), projectId),
      ...((await this.documents.list(`versions:${projectId}`)).map((entry) =>
        this.documents.delete(`versions:${projectId}`, entry.key)
      )),
      ...((await this.documents.list(`manifests:${projectId}`)).map((entry) =>
        this.documents.delete(`manifests:${projectId}`, entry.key)
      ))
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
