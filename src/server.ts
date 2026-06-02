import * as fs from "node:fs/promises";
import {
	createServer,
	type IncomingMessage,
	type ServerResponse,
} from "node:http";
import * as path from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import { WebSocket, WebSocketServer } from "ws";
import { BROWSER_TOOLS, type BrowserToolName } from "./tools.js";
import type {
	BrowserSession,
	ClientToServerMessage,
	MCPRequest,
	MCPResponse,
	ToolMetadata,
} from "./types.js";

export class ApertureServer {
	private wss: WebSocketServer;
	private sessions: Map<string, BrowserSession> = new Map();
	private mcpClients: Set<WebSocket> = new Set();
	private pendingRequests: Map<string, (result: any) => void> = new Map();
	private mcpInitialized = false;

	private port: number;
	private options: { verbose?: boolean; silentStartup?: boolean };

	// SSE transport sessions for remote MCP clients (e.g. opencode type: "remote")
	private sseSessions: Map<
		string,
		{ res: ServerResponse; lastEventId: number }
	> = new Map();

	constructor(
		port = 3456,
		options: { verbose?: boolean; silentStartup?: boolean } = {},
	) {
		this.port = port;
		this.options = options;
		const server = createServer(async (req, res) => {
			// SSE endpoint for remote MCP clients
			if (req.method === "GET" && req.url === "/sse") {
				await this.handleSSEConnection(req, res);
				return;
			}

			// JSON-RPC message endpoint for SSE clients
			if (req.method === "POST" && req.url?.startsWith("/messages")) {
				await this.handleSSEMessage(req, res);
				return;
			}

			if (req.method === "POST" && req.url === "/mcp") {
				await this.handleHttpPost(req, res);
				return;
			}

			if (req.url === "/aperture.js") {
				await this.serveClientScript(res);
			} else {
				res.writeHead(404, { "Content-Type": "text/plain" });
				res.end("Not Found");
			}
		});

		this.wss = new WebSocketServer({ server, path: "/mcp" });
		this.setupWSS();
		this.setupStdio();

		server.listen(port, () => {
			if (!this.options.silentStartup) {
				console.error(
					`[Aperture] MCP server on ws://localhost:${this.port}/mcp`,
				);
				console.error(
					`[Aperture] Browser client script: http://localhost:${this.port}/aperture.js`,
				);
			}
		});
	}

	private async handleHttpPost(req: IncomingMessage, res: ServerResponse) {
		let body = "";
		req.on("data", (chunk) => {
			body += chunk;
		});
		req.on("end", async () => {
			try {
				const reqData = JSON.parse(body) as MCPRequest;
				await this.handleMCPRequest(reqData, (response) => {
					res.writeHead(200, { "Content-Type": "application/json" });
					res.end(JSON.stringify(response));
				});
			} catch {
				res.writeHead(400, { "Content-Type": "application/json" });
				res.end(
					JSON.stringify({
						jsonrpc: "2.0",
						id: null,
						error: { code: -32700, message: "Parse error" },
					}),
				);
			}
		});
	}

	private async handleSSEConnection(_req: IncomingMessage, res: ServerResponse) {
		const sessionId = crypto.randomUUID();
		res.writeHead(200, {
			"Content-Type": "text/event-stream",
			"Cache-Control": "no-cache, no-transform",
			Connection: "keep-alive",
		});

		// Send the endpoint event so the client knows where to POST messages
		const messageUrl = `/messages?sessionId=${sessionId}`;
		res.write(`event: endpoint\ndata: ${messageUrl}\n\n`);

		this.sseSessions.set(sessionId, { res, lastEventId: 0 });

		console.error(`[Aperture] SSE session ${sessionId.slice(0, 8)} connected`);

		// Remove session when client disconnects
		res.on("close", () => {
			this.sseSessions.delete(sessionId);
			console.error(`[Aperture] SSE session ${sessionId.slice(0, 8)} disconnected`);
		});
	}

	private async handleSSEMessage(req: IncomingMessage, res: ServerResponse) {
		const url = new URL(req.url || "/", `http://localhost:${this.port}`);
		const sessionId = url.searchParams.get("sessionId");
		const session = sessionId ? this.sseSessions.get(sessionId) : undefined;

		if (!session) {
			res.writeHead(404, { "Content-Type": "text/plain" });
			res.end("Session not found");
			return;
		}

		let body = "";
		req.on("data", (chunk) => {
			body += chunk;
		});
		req.on("end", async () => {
			try {
				const reqData = JSON.parse(body) as MCPRequest;
				await this.handleMCPRequest(reqData, (response) => {
					// Send response back through SSE stream
					const data = JSON.stringify(response);
					session.res.write(`data: ${data}\n\n`);
				});
				res.writeHead(202);
				res.end("Accepted");
			} catch {
				res.writeHead(400, { "Content-Type": "application/json" });
				res.end(
					JSON.stringify({
						jsonrpc: "2.0",
						id: null,
						error: { code: -32700, message: "Parse error" },
					}),
				);
			}
		});
	}

	private async serveClientScript(res: ServerResponse) {
		try {
			const fileUrl = new URL(import.meta.url);
			const __dirname = path.dirname(fileURLToPath(fileUrl));
			let clientPath = path.join(__dirname, "client.js");

			// Resolve path dynamically under vitest/ts-node or production
			try {
				await fs.access(clientPath);
			} catch {
				const distPath = path.join(__dirname, "../dist-browser/client.js");
				try {
					await fs.access(distPath);
					clientPath = distPath;
				} catch {
					const tsPath = path.join(__dirname, "client.ts");
					await fs.access(tsPath);
					clientPath = tsPath;
				}
			}

			const content = await fs.readFile(clientPath, "utf-8");
			res.writeHead(200, { "Content-Type": "application/javascript" });
			res.end(content);
		} catch (_err) {
			res.writeHead(500, { "Content-Type": "text/plain" });
			res.end("Error loading aperture client script");
		}
	}

	private setupWSS() {
		this.wss.on("connection", (ws, req) => {
			const url = new URL(req.url || "/", "http://localhost");
			const clientType = url.searchParams.get("type") || "unknown";

			if (clientType === "browser") {
				this.handleBrowserConnection(ws, req);
			} else {
				this.handleMCPConnection(ws);
			}
		});
	}

	private handleBrowserConnection(ws: WebSocket, _req: IncomingMessage) {
		const sessionId = crypto.randomUUID();
		const session: BrowserSession = {
			ws,
			url: "",
			title: "",
			approved: false,
			focused: false,
			capabilities: new Set(),
			customTools: [],
		};
		this.sessions.set(sessionId, session);

		ws.on("message", (raw) => {
			try {
				const msg = JSON.parse(raw.toString()) as ClientToServerMessage;
				if (msg.type === "register") {
					session.url = msg.url;
					session.title = msg.title;
					session.customTools = msg.customTools || [];
					console.error(
						`[Aperture] Session ${sessionId.slice(0, 8)} registered: ${msg.title}`,
					);
					ws.send(JSON.stringify({ type: "registered", sessionId }));

					if (this.mcpInitialized) {
						ws.send(JSON.stringify({ type: "agent_connected" }));
					}
				}
				if (msg.type === "approval") {
					session.approved = msg.approved;
					session.capabilities = new Set(msg.capabilities || []);
					console.error(
						`[Aperture] Session ${sessionId.slice(0, 8)} ${msg.approved ? "approved" : "denied"}`,
					);
				}
				if (msg.type === "focus") {
					session.focused = msg.focused;
				}
				if (msg.type === "result") {
					const resolvePending = this.pendingRequests.get(msg.requestId);
					if (resolvePending) {
						resolvePending(msg.result);
					}
					// Forward result back to the MCP client that made the request (via WebSocket if listening)
					this.broadcastToMCP({
						type: "browser_result",
						requestId: msg.requestId,
						result: msg.result,
					});
				}
			} catch {
				// ignore malformed
			}
		});

		ws.on("close", () => {
			this.sessions.delete(sessionId);
		});
	}

	private handleMCPConnection(ws: WebSocket) {
		this.mcpClients.add(ws);

		ws.on("message", (raw) => {
			try {
				const req: MCPRequest = JSON.parse(raw.toString());
				this.handleMCPRequest(req, (res) => {
					if (ws.readyState === WebSocket.OPEN) {
						ws.send(JSON.stringify(res));
					}
				});
			} catch {
				ws.send(
					JSON.stringify({
						jsonrpc: "2.0",
						id: null,
						error: { code: -32700, message: "Parse error" },
					}),
				);
			}
		});

		ws.on("close", () => {
			this.mcpClients.delete(ws);
		});

		// Send initialization capabilities for legacy clients
		ws.send(
			JSON.stringify({
				jsonrpc: "2.0",
				id: 0,
				result: {
					protocolVersion: "2024-11-05",
					capabilities: {},
					serverInfo: { name: "aperture", version: "0.1.0" },
				},
			}),
		);
	}

	private setupStdio() {
		const rl = createInterface({
			input: process.stdin,
			output: process.stdout,
			terminal: false,
		});

		rl.on("line", (line) => {
			if (!line.trim()) return;
			try {
				const req: MCPRequest = JSON.parse(line);
				this.handleMCPRequest(req, (res) => {
					process.stdout.write(`${JSON.stringify(res)}\n`);
				});
			} catch (_err) {
				process.stdout.write(
					`${JSON.stringify({
						jsonrpc: "2.0",
						id: null,
						error: { code: -32700, message: "Parse error" },
					})}\n`,
				);
			}
		});

		process.on("SIGINT", () => {
			process.exit(0);
		});

		process.on("SIGTERM", () => {
			process.exit(0);
		});
	}

	private async handleMCPRequest(
		req: MCPRequest,
		send: (res: MCPResponse) => void,
	) {
		if (req.method === "initialize") {
			this.handleInitialize(req, send);
			return;
		}

		if (req.method === "notifications/initialized") {
			return;
		}

		if (req.method === "tools/list") {
			this.handleToolsList(req, send);
			return;
		}

		if (req.method === "tools/call") {
			await this.handleToolsCall(req, send);
			return;
		}

		send({
			jsonrpc: "2.0",
			id: req.id,
			error: { code: -32601, message: "Method not found" },
		});
	}

	private handleInitialize(req: MCPRequest, send: (res: MCPResponse) => void) {
		this.mcpInitialized = true;
		const agentConnectedMsg = JSON.stringify({ type: "agent_connected" });
		this.sessions.forEach((session) => {
			if (session.ws.readyState === WebSocket.OPEN) {
				session.ws.send(agentConnectedMsg);
			}
		});

		send({
			jsonrpc: "2.0",
			id: req.id,
			result: {
				protocolVersion: "2024-11-05",
				capabilities: {
					tools: {},
				},
				serverInfo: { name: "aperture", version: "0.1.0" },
			},
		});
	}

	private handleToolsList(req: MCPRequest, send: (res: MCPResponse) => void) {
		const tools = Object.entries(BROWSER_TOOLS).map(([name, def]) => ({
			name,
			description: def.description,
			inputSchema: def.inputSchema,
		})) as Array<ToolMetadata>;

		const addedCustomTools = new Set<string>();
		for (const session of this.sessions.values()) {
			if (session.approved && session.customTools) {
				for (const ct of session.customTools) {
					if (!addedCustomTools.has(ct.name)) {
						addedCustomTools.add(ct.name);
						tools.push(ct);
					}
				}
			}
		}

		send({ jsonrpc: "2.0", id: req.id, result: { tools } });
	}

	private async handleToolsCall(
		req: MCPRequest,
		send: (res: MCPResponse) => void,
	) {
		const params = req.params as
			| { name: string; arguments?: Record<string, unknown> }
			| undefined;
		const toolName = params?.name as string;

		if (toolName === "browser_list_sessions") {
			const sessions = Array.from(this.sessions.entries()).map(([id, s]) => ({
				sessionId: id,
				url: s.url,
				title: s.title,
				approved: s.approved,
				focused: s.focused,
				capabilities: Array.from(s.capabilities),
			}));
			send({ jsonrpc: "2.0", id: req.id, result: { sessions } });
			return;
		}

		let isValid = !!BROWSER_TOOLS[toolName as BrowserToolName];
		if (!isValid) {
			for (const session of this.sessions.values()) {
				if (
					session.approved &&
					session.customTools?.some((t) => t.name === toolName)
				) {
					isValid = true;
					break;
				}
			}
		}

		if (!toolName || !isValid) {
			send({
				jsonrpc: "2.0",
				id: req.id,
				error: { code: -32601, message: "Tool not found" },
			});
			return;
		}

		const args = (params?.arguments || {}) as Record<string, unknown>;
		const sessionId = args.sessionId as string | undefined;

		// If a specific session was requested, use it
		if (sessionId) {
			const session = this.sessions.get(sessionId);
			if (!session || session.ws.readyState !== WebSocket.OPEN) {
				send({
					jsonrpc: "2.0",
					id: req.id,
					error: { code: -32000, message: "Session not found or closed" },
				});
				return;
			}
			await this.forwardToolCall(
				req,
				send,
				session,
				toolName,
				params?.arguments || {},
			);
			return;
		}

		// Focus-aware session selection
		const focusedSession = this.getFocusedSession();
		if (focusedSession) {
			if (focusedSession.approved) {
				await this.forwardToolCall(
					req,
					send,
					focusedSession,
					toolName,
					params?.arguments || {},
				);
				return;
			}

			// Focused session is unapproved — broadcast to ALL connected sessions
			// so the approval modal pops on every tab. First to approve wins.
			const connectedSessions = Array.from(this.sessions.values()).filter(
				(s) => s.ws.readyState === WebSocket.OPEN,
			);
			if (connectedSessions.length === 0) {
				send({
					jsonrpc: "2.0",
					id: req.id,
					error: {
						code: -32000,
						message:
							"No browser session connected. Ask the user to enable aperture in their dev session.",
					},
				});
				return;
			}

			const requestId = crypto.randomUUID();
			for (const s of connectedSessions) {
				s.ws.send(
					JSON.stringify({
						type: "tool_call",
						requestId,
						tool: toolName,
						args: params?.arguments || {},
					}),
				);
			}

			const result = await this.waitForFirstBrowserResult(requestId, 60000);
			if (result) {
				send({ jsonrpc: "2.0", id: req.id, result });
			} else {
				send({
					jsonrpc: "2.0",
					id: req.id,
					error: {
						code: -32002,
						message:
							"Browser session did not respond in time. The user may have dismissed the approval dialog.",
					},
				});
			}
			return;
		}

		// No focused session — fall back to approved session logic
		const approvedSession = this.getApprovedSession();
		if (approvedSession) {
			await this.forwardToolCall(
				req,
				send,
				approvedSession,
				toolName,
				params?.arguments || {},
			);
			return;
		}

		// Multiple approved sessions without a focused one — ambiguous
		const approvedCount = Array.from(this.sessions.values()).filter(
			(s) => s.approved && s.ws.readyState === WebSocket.OPEN,
		).length;
		if (approvedCount > 1) {
			send({
				jsonrpc: "2.0",
				id: req.id,
				error: {
					code: -32000,
					message:
						"Multiple approved browser sessions are connected. Use browser_list_sessions to get sessionIds, then pass sessionId in subsequent tool calls.",
				},
			});
			return;
		}

		// Zero approved sessions — forward to ALL connected sessions so
		// the approval modal pops on every tab. First to approve wins.
		const connectedSessions = Array.from(this.sessions.values()).filter(
			(s) => s.ws.readyState === WebSocket.OPEN,
		);
		if (connectedSessions.length === 0) {
			send({
				jsonrpc: "2.0",
				id: req.id,
				error: {
					code: -32000,
					message:
						"No browser session connected. Ask the user to enable aperture in their dev session.",
				},
			});
			return;
		}

		const requestId = crypto.randomUUID();
		for (const s of connectedSessions) {
			s.ws.send(
				JSON.stringify({
					type: "tool_call",
					requestId,
					tool: toolName,
					args: params?.arguments || {},
				}),
			);
		}

		const result = await this.waitForFirstBrowserResult(requestId, 60000);
		if (result) {
			send({ jsonrpc: "2.0", id: req.id, result });
		} else {
			send({
				jsonrpc: "2.0",
				id: req.id,
				error: {
					code: -32002,
					message:
						"Browser session did not respond in time. The user may have dismissed the approval dialog.",
				},
			});
		}
	}

	private async forwardToolCall(
		req: MCPRequest,
		send: (res: MCPResponse) => void,
		session: BrowserSession,
		toolName: string,
		args: Record<string, unknown>,
	) {
		if (
			toolName === "browser_evaluate" &&
			!session.capabilities.has("evaluate")
		) {
			send({
				jsonrpc: "2.0",
				id: req.id,
				error: {
					code: -32001,
					message:
						"browser_evaluate requires explicit approval. Prompt the user to allow JS evaluation.",
				},
			});
			return;
		}

		const requestId = crypto.randomUUID();
		session.ws.send(
			JSON.stringify({
				type: "tool_call",
				requestId,
				tool: toolName,
				args,
			}),
		);

		const result = await this.waitForBrowserResult(requestId, 5000);
		if (result) {
			send({ jsonrpc: "2.0", id: req.id, result });
		} else {
			send({
				jsonrpc: "2.0",
				id: req.id,
				error: {
					code: -32002,
					message: "Browser session did not respond in time.",
				},
			});
		}
	}

	private getApprovedSession(sessionId?: string): BrowserSession | undefined {
		// Specific session requested
		if (sessionId) {
			const session = this.sessions.get(sessionId);
			if (
				session &&
				session.approved &&
				session.ws.readyState === WebSocket.OPEN
			) {
				return session;
			}
			return undefined;
		}

		// Return the sole approved session, or undefined if multiple/none
		let found: BrowserSession | undefined;
		for (const session of this.sessions.values()) {
			if (session.approved && session.ws.readyState === WebSocket.OPEN) {
				if (found) return undefined; // Multiple approved sessions — must specify sessionId
				found = session;
			}
		}
		return found;
	}

	private getFocusedSession(): BrowserSession | undefined {
		for (const session of this.sessions.values()) {
			if (session.focused && session.ws.readyState === WebSocket.OPEN) {
				return session;
			}
		}
		return undefined;
	}

	private waitForBrowserResult(
		requestId: string,
		timeoutMs: number,
	): Promise<unknown | null> {
		return new Promise((resolve) => {
			const timer = setTimeout(() => {
				this.pendingRequests.delete(requestId);
				resolve(null);
			}, timeoutMs);

			this.pendingRequests.set(requestId, (result) => {
				clearTimeout(timer);
				this.pendingRequests.delete(requestId);
				resolve(result);
			});
		});
	}

	private waitForFirstBrowserResult(
		requestId: string,
		timeoutMs: number,
	): Promise<unknown | null> {
		return new Promise((resolve) => {
			const timer = setTimeout(() => {
				this.pendingRequests.delete(requestId);
				resolve(null);
			}, timeoutMs);

			// Wrap the resolve so it only fires once (first session to respond wins)
			let settled = false;
			this.pendingRequests.set(requestId, (result) => {
				if (settled) return;
				settled = true;
				clearTimeout(timer);
				this.pendingRequests.delete(requestId);
				resolve(result);
			});
		});
	}

	private broadcastToMCP(msg: unknown) {
		const data = JSON.stringify(msg);
		this.mcpClients.forEach((ws) => {
			if (ws.readyState === WebSocket.OPEN) ws.send(data);
		});
	}
}

// If run directly, start server
if (import.meta.url === `file://${process.argv[1]}`) {
	const port = Number(process.env.APERTURE_PORT) || 3456;
	new ApertureServer(port);
}
