// @vitest-environment jsdom
import { afterAll, beforeAll, expect, test, vi } from "vitest";
import { WebSocket } from "ws";
import type { ApertureClient } from "../src/client.js";
import { ApertureServer } from "../src/server.js";

let ApertureClientClass: typeof ApertureClient;
let server: ApertureServer;
let client: ApertureClient;
const port = 4568;

beforeAll(async () => {
	// JSDOM provides window, document, and localStorage natively.
	// We only need to mock specific missing APIs like fetch and WebSocket.
	global.window.fetch = vi.fn() as unknown as typeof fetch;
	global.window.WebSocket = WebSocket as unknown as typeof window.WebSocket;
	global.WebSocket = WebSocket as unknown as typeof window.WebSocket;

	// Dynamically import client now that mock globals are active
	const clientModule = await import("../src/client.js");
	ApertureClientClass = clientModule.ApertureClient;

	// Start Server
	server = new ApertureServer(port);

	// Start Client
	client = new ApertureClientClass({
		serverUrl: `ws://localhost:${port}`,
		onApprovalRequest: () =>
			Promise.resolve({
				approved: true,
				capabilities: ["console", "dom", "network", "storage"],
			}),
		customTools: {
			custom_redux_state: {
				description: "Gets fake redux state",
				inputSchema: { type: "object", properties: {} },
				handler: () => ({ state: "faked" }),
			},
		},
	});

	(client as { connect: () => void }).connect();

	// Wait for client to register with server
	await new Promise((resolve) => setTimeout(resolve, 200));
});

afterAll(() => {
	if (client) {
		(client as { disconnect: () => void }).disconnect();
	}
	if (server) {
		// @ts-expect-error accessing private for cleanup
		server.wss.close();
		// @ts-expect-error accessing private for cleanup
		if (server.wss.options.server) {
			// @ts-expect-error accessing private for cleanup
			server.wss.options.server.close();
		}
	}
});

async function sendMcpRequest<T = unknown>(
	ws: WebSocket,
	method: string,
	params?: Record<string, unknown>,
	id = crypto.randomUUID(),
): Promise<T> {
	return new Promise((resolve, reject) => {
		const timeout = setTimeout(() => reject(new Error("Timeout")), 5000);
		const handler = (data: import("ws").RawData) => {
			const msg = JSON.parse(data.toString()) as {
				id: string;
				result?: unknown;
				error?: { message: string };
			};
			if (msg.id === id) {
				clearTimeout(timeout);
				ws.off("message", handler);
				if (msg.error) reject(new Error(msg.error.message));
				else resolve(msg.result as T);
			}
		};
		ws.on("message", handler);
		ws.send(JSON.stringify({ jsonrpc: "2.0", id, method, params }));
	});
}

test("routes tool calls from MCP to client and returns results", async () => {
	// Print a console log in node context to trigger console buffering
	console.log("Integrative Test Log Payload");

	const mcp = new WebSocket(`ws://localhost:${port}/mcp`);
	await new Promise<void>((resolve, reject) => {
		mcp.on("open", resolve);
		mcp.on("error", reject);
	});

	await sendMcpRequest(mcp, "initialize", {
		protocolVersion: "2024-11-05",
		capabilities: {},
		clientInfo: { name: "test-client", version: "1.0.0" },
	});

	const result = await sendMcpRequest<{
		content: Array<{ type: string; text: string }>;
	}>(mcp, "tools/call", {
		name: "browser_page_info",
		arguments: { logLimit: 10, logLevel: "all" },
	});

	expect(result.content).toBeDefined();
	expect(result.content[0].type).toBe("text");

	const pageInfo = JSON.parse(result.content[0].text) as {
		url: string;
		title: string;
		logs: Array<{
			level: string;
			message: string;
			timestamp: number;
		}>;
	};
	const logs = pageInfo.logs;
	expect(Array.isArray(logs)).toBe(true);

	const matchingLog = logs.find((log) =>
		log.message.includes("Integrative Test Log Payload"),
	);
	expect(matchingLog).toBeDefined();
	expect(matchingLog?.level).toBe("log");

	mcp.close();
});

test("exposes custom tools in tools/list and routes custom tool calls", async () => {
	const mcp = new WebSocket(`ws://localhost:${port}/mcp`);
	await new Promise<void>((resolve, reject) => {
		mcp.on("open", resolve);
		mcp.on("error", reject);
	});

	await sendMcpRequest(mcp, "initialize", {
		protocolVersion: "2024-11-05",
		capabilities: {},
		clientInfo: { name: "test-client", version: "1.0.0" },
	});

	const listResult = await sendMcpRequest<{
		tools: Array<{ name: string; description: string }>;
	}>(mcp, "tools/list");

	expect(listResult.tools).toBeDefined();
	const customTool = listResult.tools.find(
		(t) => t.name === "custom_redux_state",
	);
	expect(customTool).toBeDefined();
	expect(customTool?.description).toBe("Gets fake redux state");

	const callResult = await sendMcpRequest<{
		content: Array<{ type: string; text: string }>;
	}>(mcp, "tools/call", {
		name: "custom_redux_state",
		arguments: {},
	});

	expect(callResult.content).toBeDefined();
	expect(JSON.parse(callResult.content[0].text)).toEqual({ state: "faked" });

	mcp.close();
});
