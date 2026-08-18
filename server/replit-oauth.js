export class ReplitOAuthProvider {
  constructor(options) {
    this.sessionId = options.sessionId;
    this.credentials = options.credentials;
    this.expectedState = options.state;
    this.authorizationUrl = null;
    this._redirectUrl = options.redirectUrl;
  }

  get redirectUrl() {
    return this._redirectUrl;
  }

  get clientMetadata() {
    return {
      client_name: "Living Blueprint",
      client_uri: "https://github.com/ArS377/app-creator",
      redirect_uris: [String(this.redirectUrl)],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none"
    };
  }

  async state() {
    return this.expectedState;
  }

  async clientInformation() {
    return (await this.credentials.get(this.sessionId)).clientInformation;
  }

  async saveClientInformation(clientInformation) {
    await this.credentials.patch(this.sessionId, { clientInformation });
  }

  async tokens() {
    return (await this.credentials.get(this.sessionId)).tokens;
  }

  async saveTokens(tokens) {
    await this.credentials.patch(this.sessionId, { tokens, connectedAt: new Date().toISOString() });
  }

  async redirectToAuthorization(authorizationUrl) {
    this.authorizationUrl = authorizationUrl;
    await this.credentials.patch(this.sessionId, {
      authorizationUrl: authorizationUrl.toString(),
      state: this.expectedState
    });
  }

  async saveCodeVerifier(codeVerifier) {
    await this.credentials.patch(this.sessionId, { codeVerifier });
  }

  async codeVerifier() {
    const codeVerifier = (await this.credentials.get(this.sessionId)).codeVerifier;
    if (!codeVerifier) throw new Error("The Replit authorization attempt has expired.");
    return codeVerifier;
  }

  async saveDiscoveryState(discoveryState) {
    await this.credentials.patch(this.sessionId, { discoveryState });
  }

  async discoveryState() {
    return (await this.credentials.get(this.sessionId)).discoveryState;
  }

  async validateResourceURL(serverUrl, resource) {
    const server = new URL(serverUrl);
    if (resource && new URL(resource).origin !== server.origin) {
      throw new Error("The OAuth resource does not match the Replit MCP server.");
    }
    return new URL(serverUrl);
  }

  async invalidateCredentials(scope) {
    if (scope === "all") {
      await this.credentials.delete(this.sessionId);
      return;
    }
    const fieldMap = {
      client: ["clientInformation"],
      tokens: ["tokens", "connectedAt"],
      verifier: ["codeVerifier", "state", "authorizationUrl"],
      discovery: ["discoveryState"]
    };
    const changes = Object.fromEntries((fieldMap[scope] || []).map((field) => [field, undefined]));
    await this.credentials.patch(this.sessionId, changes);
  }
}
