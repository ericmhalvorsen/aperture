import * as fs from "node:fs/promises";
import { createServer, type IncomingMessage } from "node:http";
import * as path from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import { WebSocket, WebSocketServer } from "ws";
import { BROWSER_TOOLS, type BrowserToolName } from "./tools.js";

interface BrowserSession {
	ws: WebSocket;
	url: string;
	title: string;
	approved: boolean;
	capabilities: Set<string>;
}

interface MCPRequest {
	jsonrpc: "2.0";
	id: number | string;
	method: string;
	params?: unknown;
}

interface MCPResponse {
	jsonrpc: "2.0";
	id: number | string | null;
	result?: unknown;
	error?: { code: number; message: string };
}

export class ApertureServer {
	private wss: WebSocketServer;
	private sessions: Map<string, BrowserSession> = new Map();
	private mcpClients: Set<WebSocket> = new Set();
	private pendingRequests: Map<string, (result: any) => void> = new Map();
	private mcpInitialized = false;

	private port: number;

	constructor(port = 3456) {
		this.port = port;
		const server = createServer(async (req, res) => {
			// HTTP JSON-RPC endpoint for MCP clients that connect via HTTP instead of stdio
			if (req.method === "POST" && req.url === "/mcp") {
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
				return;
			}

			if (req.url === "/aperture.js") {
				try {
					const fileUrl = new URL(import.meta.url);
					const __dirname = path.dirname(fileURLToPath(fileUrl));
					let clientPath = path.join(__dirname, "client.js");

					// Resolve path dynamically under vitest/ts-node or production
					try {
						await fs.access(clientPath);
					} catch {
						const distPath = path.join(__dirname, "../dist/client.js");
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
			} else {
				res.writeHead(404, { "Content-Type": "text/plain" });
				res.end("Not Found");
			}
		});

		this.wss = new WebSocketServer({ server, path: "/mcp" });
		this.setupWSS();
		this.setupStdio();

		server.listen(port, () => {
			console.error(`[Aperture] MCP server on ws://localhost:${this.port}/mcp`);
			console.error(
				`[Aperture] Browser client script: http://localhost:${this.port}/aperture.js`,
			);
		});
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
			capabilities: new Set(),
		};
		this.sessions.set(sessionId, session);

		ws.on("message", (raw) => {
			try {
				const msg = JSON.parse(raw.toString());
				if (msg.type === "register") {
					session.url = msg.url;
					session.title = msg.title;
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
	}

	private async handleMCPRequest(
		req: MCPRequest,
		send: (res: MCPResponse) => void,
	) {
		if (req.method === "initialize") {
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
			return;
		}

		if (req.method === "notifications/initialized") {
			return;
		}

		if (req.method === "tools/list") {
			const tools = Object.entries(BROWSER_TOOLS).map(([name, def]) => ({
				name,
				description: def.description,
				inputSchema: def.inputSchema,
			}));
			send({ jsonrpc: "2.0", id: req.id, result: { tools } });
			return;
		}

		if (
			req.method === "tools/call" &&
			(req.params as any)?.name === "browser_list_sessions"
		) {
			const sessions = Array.from(this.sessions.entries()).map(([id, s]) => ({
				sessionId: id,
				url: s.url,
				title: s.title,
				approved: s.approved,
				capabilities: Array.from(s.capabilities),
			}));
			send({ jsonrpc: "2.0", id: req.id, result: { sessions } });
			return;
		}

		if (req.method === "tools/call") {
			const params = req.params as
				| { name: string; arguments?: Record<string, unknown> }
				| undefined;
			const toolName = params?.name as BrowserToolName;
			if (!toolName || !BROWSER_TOOLS[toolName]) {
				send({
					jsonrpc: "2.0",
					id: req.id,
					error: { code: -32601, message: "Tool not found" },
				});
				return;
			}

			const args = (params?.arguments || {}) as Record<string, unknown>;
			const session = this.getApprovedSession(
				args.sessionId as string | undefined,
			);
			if (!session) {
				// Check if there are multiple approved sessions
				const approvedSessions = Array.from(this.sessions.values()).filter(
					(s) => s.approved && s.ws.readyState === WebSocket.OPEN,
				);
				if (approvedSessions.length > 1) {
					send({
						jsonrpc: "2.0",
						id: req.id,
						error: {
							code: -32000,
							message:
								"Multiple approved browser sessions are connected. Use browser_list_sessions to get sessionIds, then pass sessionId in subsequent tool calls.",
						},
					});
				} else {
					send({
						jsonrpc: "2.0",
						id: req.id,
						error: {
							code: -32000,
							message:
								"No approved browser session. Ask the user to enable aperture in their dev session.",
						},
					});
				}
				return;
			}

			// For evaluate, require explicit capability
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

			// Forward tool call to browser session
			const requestId = crypto.randomUUID();
			session.ws.send(
				JSON.stringify({
					type: "tool_call",
					requestId,
					tool: toolName,
					args: params?.arguments || {},
				}),
			);

			// Wait for result (with timeout)
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
			return;
		}

		send({
			jsonrpc: "2.0",
			id: req.id,
			error: { code: -32601, message: "Method not found" },
		});
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
