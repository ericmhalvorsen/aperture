import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
	CallToolRequestSchema,
	InitializeRequestSchema,
	ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { WebSocket } from "ws";
import { BROWSER_TOOLS, type BrowserToolName } from "./tools.js";
import type { BrowserSession, ToolMetadata } from "./types.js";

export interface SharedServerState {
	mcpInitialized: boolean;
}

export function createApertureMcpServer(
	sessions: Map<string, BrowserSession>,
	pendingRequests: Map<string, (result: unknown) => void>,
	sharedState: SharedServerState,
) {
	const server = new Server(
		{ name: "aperture", version: "0.1.1" },
		{ capabilities: { tools: {} } },
	);

	server.setRequestHandler(InitializeRequestSchema, async (request) => {
		sharedState.mcpInitialized = true;

		const msg = JSON.stringify({ type: "agent_connected" });
		for (const session of sessions.values()) {
			if (session.ws.readyState === WebSocket.OPEN) {
				session.ws.send(msg);
			}
		}

		return {
			protocolVersion: request.params.protocolVersion,
			capabilities: { tools: {} },
			serverInfo: { name: "aperture", version: "0.1.0" },
		};
	});

	server.setRequestHandler(ListToolsRequestSchema, async () => {
		const tools = Object.entries(BROWSER_TOOLS).map(([name, def]) => ({
			name,
			description: def.description,
			inputSchema: def.inputSchema,
		})) as Array<ToolMetadata>;

		const addedCustomTools = new Set<string>();
		for (const session of sessions.values()) {
			if (session.approved && session.customTools) {
				for (const ct of session.customTools) {
					if (!addedCustomTools.has(ct.name)) {
						addedCustomTools.add(ct.name);
						tools.push(ct);
					}
				}
			}
		}

		return { tools };
	});

	server.setRequestHandler(CallToolRequestSchema, async (request) => {
		const params = request.params;
		const toolName = params.name;
		const args = (params.arguments || {}) as Record<string, unknown>;

		if (toolName === "browser_list_sessions") {
			const sessionList = Array.from(sessions.entries()).map(([id, s]) => ({
				sessionId: id,
				url: s.url,
				title: s.title,
				approved: s.approved,
				lastActiveAt: s.lastActiveAt,
				capabilities: Array.from(s.capabilities),
			}));
			return {
				content: [
					{
						type: "text",
						text: JSON.stringify({ sessions: sessionList }, null, 2),
					},
				],
			};
		}

		let isValid = !!BROWSER_TOOLS[toolName as BrowserToolName];
		if (!isValid) {
			for (const session of sessions.values()) {
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
			return {
				content: [{ type: "text", text: `Tool not found: ${toolName}` }],
				isError: true,
			};
		}

		const sessionId = args.sessionId as string | undefined;

		if (sessionId) {
			const session = sessions.get(sessionId);
			if (!session || session.ws.readyState !== WebSocket.OPEN) {
				return {
					content: [
						{
							type: "text",
							text: "Session not found or closed",
						},
					],
					isError: true,
				};
			}
			return forwardToolCall(
				sessions,
				pendingRequests,
				session,
				toolName,
				args,
			);
		}

		const lastActiveSession = getLastActiveSession(sessions);
		if (lastActiveSession) {
			return forwardToolCall(
				sessions,
				pendingRequests,
				lastActiveSession,
				toolName,
				args,
			);
		}

		const approvedCount = Array.from(sessions.values()).filter(
			(s) => s.approved && s.ws.readyState === WebSocket.OPEN,
		).length;
		if (approvedCount > 1) {
			return {
				content: [
					{
						type: "text",
						text: "Multiple approved browser sessions are connected. Use browser_list_sessions to get sessionIds, then pass sessionId in subsequent tool calls.",
					},
				],
				isError: true,
			};
		}

		const connectedSessions = Array.from(sessions.values()).filter(
			(s) => s.ws.readyState === WebSocket.OPEN,
		);
		if (connectedSessions.length === 0) {
			return {
				content: [
					{
						type: "text",
						text: "No browser session connected. Ask the user to enable aperture in their dev session.",
					},
				],
				isError: true,
			};
		}

		const requestId = crypto.randomUUID();
		for (const s of connectedSessions) {
			s.ws.send(
				JSON.stringify({
					type: "tool_call",
					requestId,
					tool: toolName,
					args,
				}),
			);
		}

		const result = await waitForFirstBrowserResult(
			pendingRequests,
			requestId,
			60000,
		);
		if (result) {
			return {
				content: [
					{
						type: "text",
						text:
							typeof result === "string"
								? result
								: JSON.stringify(result, null, 2),
					},
				],
			};
		}

		return {
			content: [
				{
					type: "text",
					text: "Browser session did not respond in time. The user may have dismissed the approval dialog.",
				},
			],
			isError: true,
		};
	});

	return server;
}

async function forwardToolCall(
	_sessions: Map<string, BrowserSession>,
	pendingRequests: Map<string, (result: unknown) => void>,
	session: BrowserSession,
	toolName: string,
	args: Record<string, unknown>,
) {
	if (
		toolName === "browser_evaluate" &&
		!session.capabilities.has("evaluate")
	) {
		return {
			content: [
				{
					type: "text",
					text: "browser_evaluate requires explicit approval. Prompt the user to allow JS evaluation.",
				},
			],
			isError: true,
		};
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

	const timeout = toolName === "browser_screenshot" ? 60000 : 15000;
	const result = await waitForBrowserResult(
		pendingRequests,
		requestId,
		timeout,
	);
	if (result) {
		return {
			content: [
				{
					type: "text",
					text:
						typeof result === "string"
							? result
							: JSON.stringify(result, null, 2),
				},
			],
		};
	}

	return {
		content: [
			{ type: "text", text: "Browser session did not respond in time." },
		],
		isError: true,
	};
}

function getLastActiveSession(
	sessions: Map<string, BrowserSession>,
): BrowserSession | undefined {
	let best: BrowserSession | undefined;
	for (const session of sessions.values()) {
		if (
			session.approved &&
			session.ws.readyState === WebSocket.OPEN &&
			(!best || session.lastActiveAt > best.lastActiveAt)
		) {
			best = session;
		}
	}
	return best;
}

function waitForBrowserResult(
	pendingRequests: Map<string, (result: unknown) => void>,
	requestId: string,
	timeoutMs: number,
): Promise<unknown | null> {
	return new Promise((resolve) => {
		const timer = setTimeout(() => {
			pendingRequests.delete(requestId);
			resolve(null);
		}, timeoutMs);

		pendingRequests.set(requestId, (result) => {
			clearTimeout(timer);
			pendingRequests.delete(requestId);
			resolve(result);
		});
	});
}

function waitForFirstBrowserResult(
	pendingRequests: Map<string, (result: unknown) => void>,
	requestId: string,
	timeoutMs: number,
): Promise<unknown | null> {
	return new Promise((resolve) => {
		const timer = setTimeout(() => {
			pendingRequests.delete(requestId);
			resolve(null);
		}, timeoutMs);

		let settled = false;
		pendingRequests.set(requestId, (result) => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			pendingRequests.delete(requestId);
			resolve(result);
		});
	});
}
