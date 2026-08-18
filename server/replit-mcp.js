import { randomBytes } from "node:crypto";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { UnauthorizedError } from "@modelcontextprotocol/sdk/client/auth.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

import { ReplitOAuthProvider } from "./replit-oauth.js";

export const REPLIT_MCP_URL = "https://replit-mcp.com/server/mcp";

export class ReplitConnectionRequiredError extends Error {
  constructor(message = "Connect Replit before using this action.") {
    super(message);
    this.name = "ReplitConnectionRequiredError";
  }
}

export class ReplitToolTimeoutError extends Error {
  constructor(message = "Replit accepted the request but did not finish before the connection timed out.") {
    super(message);
    this.name = "ReplitToolTimeoutError";
    this.outcomeUnknown = true;
  }
}

function randomState() {
  return randomBytes(32).toString("base64url");
}

function defaultClientFactory() {
  return new Client({ name: "living-blueprint", version: "1.0.0" }, { capabilities: {} });
}

function defaultTransportFactory(provider) {
  return new StreamableHTTPClientTransport(new URL(REPLIT_MCP_URL), { authProvider: provider });
}

function isTimeout(error) {
  return error?.code === -32001 || /timed? ?out|timeout/i.test(String(error?.message || ""));
}

export class ReplitMcpService {
  constructor(options) {
    this.credentials = options.credentials;
    this.clientFactory = options.clientFactory || defaultClientFactory;
    this.transportFactory = options.transportFactory || defaultTransportFactory;
  }

  provider(sessionId, redirectUrl, state) {
    return new ReplitOAuthProvider({
      sessionId,
      redirectUrl,
      state,
      credentials: this.credentials
    });
  }

  async status(sessionId) {
    const record = await this.credentials.get(sessionId);
    return {
      connected: Boolean(record.tokens),
      connectedAt: record.connectedAt || null
    };
  }

  async beginAuthorization(sessionId, redirectUrl) {
    const state = randomState();
    await this.credentials.patch(sessionId, { state, authorizationUrl: undefined });
    const provider = this.provider(sessionId, redirectUrl, state);
    const client = this.clientFactory();
    const transport = this.transportFactory(provider);

    try {
      await client.connect(transport);
      await client.close();
      return { connected: true, authorizationUrl: null };
    } catch (error) {
      if (!(error instanceof UnauthorizedError) && error?.name !== "UnauthorizedError") throw error;
      const record = await this.credentials.get(sessionId);
      const authorizationUrl = provider.authorizationUrl?.toString() || record.authorizationUrl;
      if (!authorizationUrl) throw new Error("Replit did not return an authorization URL.");
      return { connected: false, authorizationUrl };
    }
  }

  async finishAuthorization(sessionId, redirectUrl, { code, state }) {
    const record = await this.credentials.get(sessionId);
    if (!record.state || !state || record.state !== state) {
      throw new Error("The Replit authorization state did not match this browser session.");
    }
    if (!code) throw new Error("Replit did not return an authorization code.");

    const provider = this.provider(sessionId, redirectUrl, state);
    const callbackTransport = this.transportFactory(provider);
    await callbackTransport.finishAuth(code);

    const client = this.clientFactory();
    const authenticatedTransport = this.transportFactory(provider);
    await client.connect(authenticatedTransport);
    await client.close();
    await this.credentials.patch(sessionId, {
      state: undefined,
      codeVerifier: undefined,
      authorizationUrl: undefined,
      connectedAt: new Date().toISOString()
    });
    return this.status(sessionId);
  }

  async disconnect(sessionId) {
    await this.credentials.delete(sessionId);
  }

  async callTool(sessionId, redirectUrl, name, argumentsValue, options = {}) {
    if (!(await this.status(sessionId)).connected) throw new ReplitConnectionRequiredError();
    const provider = this.provider(sessionId, redirectUrl, randomState());
    const client = this.clientFactory();
    const transport = this.transportFactory(provider);

    try {
      await client.connect(transport);
      return await client.callTool(
        { name, arguments: argumentsValue },
        undefined,
        {
          timeout: options.timeout || 12 * 60 * 1000,
          maxTotalTimeout: options.maxTotalTimeout || 15 * 60 * 1000,
          resetTimeoutOnProgress: true
        }
      );
    } catch (error) {
      if (error instanceof UnauthorizedError || error?.name === "UnauthorizedError") {
        throw new ReplitConnectionRequiredError("Your Replit connection expired. Connect it again.");
      }
      if (isTimeout(error)) throw new ReplitToolTimeoutError();
      throw error;
    } finally {
      await client.close().catch(() => {});
    }
  }
}
