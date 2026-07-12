import * as fs from "node:fs/promises";
import {
	createServer,
	type IncomingMessage,
	type ServerResponse,
} from "node:http";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import type { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { randomUUID } from "node:crypto";
import { type WebSocket, WebSocketServer } from "ws";
import {
	createApertureMcpServer,
	type SharedServerState,
} from "./mcp-server.js";
import {
	parseJsonRpcBody,
	SseTransport,
	WebSocketTransport,
	writeParseError,
} from "./transports.js";
import type { BrowserSession, ClientToServerMessage } from "./types.js";

export class ApertureServer {
	private wss: WebSocketServer;
	private sessions: Map<string, BrowserSession> = new Map();
	private pendingRequests: Map<string, (result: unknown) => void> = new Map();
	private sharedState: SharedServerState = { mcpInitialized: false };

	private port: number;
	private options: {
		verbose?: boolean;
		silentStartup?: boolean;
		stdio?: boolean;
	};

	private streamableSessions: Map<
		string,
		{ transport: StreamableHTTPServerTransport; server: Server }
	> = new Map();

	private sseSessions: Map<
		string,
		{ transport: SseTransport; server: Server; res: ServerResponse }
	> = new Map();

	constructor(
		port = 3456,
		options: {
			verbose?: boolean;
			silentStartup?: boolean;
			stdio?: boolean;
		} = {},
	) {
		this.port = port;
		this.options = options;
		const server = createServer(async (req, res) => {
			res.setHeader("Access-Control-Allow-Origin", "*");
			res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
			res.setHeader(
				"Access-Control-Allow-Headers",
				"Content-Type, Mcp-Session-Id, MCP-Protocol-Version, Accept",
			);

			if (req.method === "OPTIONS") {
				res.writeHead(204);
				res.end();
				return;
			}

			if (req.method === "GET" && req.url === "/sse") {
				await this.handleSSEConnection(req, res);
				return;
			}

			if (req.method === "POST" && req.url?.startsWith("/messages")) {
				await this.handleSSEMessage(req, res);
				return;
			}

			if (req.url === "/mcp") {
				if (req.method === "POST") {
					await this.handleStreamableHttp(req, res);
					return;
				}
				if (req.method === "GET") {
					await this.handleStreamableHttpGet(req, res);
					return;
				}
				if (req.method === "DELETE") {
					await this.handleStreamableHttpDelete(req, res);
					return;
				}
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
		if (this.options.stdio) {
			this.setupStdio();
		}

		server.listen(port, "127.0.0.1", () => {
			if (!this.options.silentStartup) {
				console.error(
					`[Aperture] MCP server on http://localhost:${this.port}/mcp`,
				);
				console.error(
					`[Aperture] Browser client script: http://localhost:${this.port}/aperture.js`,
				);
			}
		});
	}

	private async handleStreamableHttp(req: IncomingMessage, res: ServerResponse) {
		const sessionId = req.headers["mcp-session-id"] as string | undefined;

		if (sessionId && this.streamableSessions.has(sessionId)) {
			const session = this.streamableSessions.get(sessionId);
			if (session) {
				await session.transport.handleRequest(req, res);
				return;
			}
		}

		const transport = new StreamableHTTPServerTransport({
			sessionIdGenerator: () => randomUUID(),
			onsessioninitialized: (sid) => {
				this.streamableSessions.set(sid, { transport, server: mcpServer });
				console.error(
					`[Aperture] Streamable HTTP session ${sid.slice(0, 8)} connected`,
				);
			},
		});

		const mcpServer = createApertureMcpServer(
			this.sessions,
			this.pendingRequests,
			this.sharedState,
		);

		transport.onclose = () => {
			const sid = transport.sessionId;
			if (sid && this.streamableSessions.has(sid)) {
				this.streamableSessions.delete(sid);
				console.error(
					`[Aperture] Streamable HTTP session ${sid.slice(0, 8)} disconnected`,
				);
			}
			mcpServer.close().catch(() => {});
		};

		await mcpServer.connect(transport);
		await transport.handleRequest(req, res);
	}

	private async handleStreamableHttpGet(req: IncomingMessage, res: ServerResponse) {
		const sessionId = req.headers["mcp-session-id"] as string | undefined;
		if (!sessionId || !this.streamableSessions.has(sessionId)) {
			res.writeHead(400, { "Content-Type": "application/json" });
			res.end(JSON.stringify({ error: "Invalid or missing session ID" }));
			return;
		}

		const session = this.streamableSessions.get(sessionId);
		if (session) {
			await session.transport.handleRequest(req, res);
		}
	}

	private async handleStreamableHttpDelete(req: IncomingMessage, res: ServerResponse) {
		const sessionId = req.headers["mcp-session-id"] as string | undefined;
		if (!sessionId || !this.streamableSessions.has(sessionId)) {
			res.writeHead(404, { "Content-Type": "application/json" });
			res.end(JSON.stringify({ error: "Session not found" }));
			return;
		}

		const session = this.streamableSessions.get(sessionId);
		if (session) {
			await session.transport.handleRequest(req, res);
			this.streamableSessions.delete(sessionId);
			await session.server.close();
			console.error(
				`[Aperture] Streamable HTTP session ${sessionId.slice(0, 8)} terminated`,
			);
		}
	}

	private async handleSSEConnection(req: IncomingMessage, res: ServerResponse) {
		const transport = new SseTransport(res);
		const _host = req.headers.host || `localhost:${this.port}`;
		const messageUrl = `/messages/${transport.sessionId}?sessionId=${transport.sessionId}`;

		const mcpServer = createApertureMcpServer(
			this.sessions,
			this.pendingRequests,
			this.sharedState,
		);

		this.sseSessions.set(transport.sessionId, {
			transport,
			server: mcpServer,
			res,
		});

		res.writeHead(200, {
			"Content-Type": "text/event-stream",
			"Cache-Control": "no-cache, no-transform",
			Connection: "keep-alive",
			"Mcp-Session-Id": transport.sessionId,
		});
		res.write(`event: endpoint\ndata: ${messageUrl}\n\n`);

		try {
			await mcpServer.connect(transport);
		} catch (_err) {
			this.sseSessions.delete(transport.sessionId);
			mcpServer.close().catch(() => {});
			res.end();
			return;
		}

		console.error(
			`[Aperture] SSE session ${transport.sessionId.slice(0, 8)} connected`,
		);

		const pingInterval = setInterval(() => {
			res.write(": ping\n\n");
		}, 30000);

		res.on("close", () => {
			clearInterval(pingInterval);
			this.sseSessions.delete(transport.sessionId);
			mcpServer.close().catch(() => {});
			console.error(
				`[Aperture] SSE session ${transport.sessionId.slice(0, 8)} disconnected`,
			);
		});
	}

	private async handleSSEMessage(req: IncomingMessage, res: ServerResponse) {
		const url = new URL(req.url || "/", `http://localhost:${this.port}`);
		const headerSessionId = req.headers["mcp-session-id"];

		const pathParts = url.pathname.split("/");
		const pathSessionId = pathParts.length > 2 ? pathParts[2] : null;

		const sessionId =
			pathSessionId ||
			url.searchParams.get("sessionId") ||
			(Array.isArray(headerSessionId) ? headerSessionId[0] : headerSessionId);
		const session = sessionId ? this.sseSessions.get(sessionId) : undefined;

		if (!session) {
			res.writeHead(404, {
				"Content-Type": "text/plain",
				"Mcp-Session-Id": sessionId || "",
			});
			res.end("Session not found");
			return;
		}

		try {
			const message = await parseJsonRpcBody(req);
			session.transport.receiveMessage(message);
			res.writeHead(202, {
				"Content-Type": "text/plain",
				"Mcp-Session-Id": sessionId,
			});
			res.end("Accepted");
		} catch {
			writeParseError(res);
		}
	}

	private async serveClientScript(res: ServerResponse) {
		try {
			const fileUrl = new URL(import.meta.url);
			const __dirname = path.dirname(fileURLToPath(fileUrl));
			const possiblePaths = [
				path.join(__dirname, "../dist-browser/client.js"),
				path.join(__dirname, "../../dist-browser/client.js"),
				path.join(__dirname, "dist-browser/client.js"),
				path.join(__dirname, "client.ts"),
				path.join(__dirname, "../src/client.ts"),
			];

			let clientPath = possiblePaths[0];
			for (const p of possiblePaths) {
				try {
					await fs.access(p);
					clientPath = p;
					break;
				} catch {}
			}

			const content = await fs.readFile(clientPath, "utf-8");
			res.writeHead(200, { "Content-Type": "application/javascript" });
			res.end(content);
		} catch (err) {
			console.error("[Aperture] Error loading client script:", err);
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
			lastActiveAt: Date.now(),
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

					if (this.sharedState.mcpInitialized) {
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
					if (msg.focused) {
						session.lastActiveAt = Date.now();
					}
				}
				if (msg.type === "result") {
					const resolvePending = this.pendingRequests.get(msg.requestId);
					if (resolvePending) {
						resolvePending(msg.result);
					}
				}
			} catch {}
		});

		ws.on("close", () => {
			this.sessions.delete(sessionId);
		});
	}

	private handleMCPConnection(ws: WebSocket) {
		const transport = new WebSocketTransport(ws);
		const mcpServer = createApertureMcpServer(
			this.sessions,
			this.pendingRequests,
			this.sharedState,
		);
		mcpServer.connect(transport).catch((err: Error) => {
			console.error("[Aperture] MCP connection error:", err.message);
		});

		ws.on("close", () => {
			mcpServer.close().catch(() => {});
		});
	}

	private setupStdio() {
		const transport = new StdioServerTransport();
		const mcpServer = createApertureMcpServer(
			this.sessions,
			this.pendingRequests,
			this.sharedState,
		);
		mcpServer.connect(transport).catch((err: Error) => {
			console.error("[Aperture] Stdio connection error:", err.message);
		});

		process.on("SIGINT", () => {
			mcpServer.close().catch(() => {});
			process.exit(0);
		});

		process.on("SIGTERM", () => {
			mcpServer.close().catch(() => {});
			process.exit(0);
		});
	}
}

if (import.meta.url === `file://${process.argv[1]}`) {
	const port = Number(process.env.APERTURE_PORT) || 3456;
	new ApertureServer(port);
}
