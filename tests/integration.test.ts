// @vitest-environment jsdom
import { afterAll, beforeAll, expect, test } from "vitest";
import { WebSocket } from "ws";
import type { ApertureClient } from "../src/client.js";
import { ApertureServer } from "../src/server.js";

let ApertureClientClass: typeof ApertureClient;
let server: ApertureServer;
let client: ApertureClient;
const port = 4568;
let originalWebSocket: typeof globalThis.WebSocket;
let originalFetch: typeof window.fetch;

type TextContent = { type: string; text: string };

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function isTextContent(value: unknown): value is TextContent {
	return (
		isRecord(value) &&
		typeof value.type === "string" &&
		typeof value.text === "string"
	);
}

function isToolResult(value: unknown): value is { content: TextContent[] } {
	return (
		isRecord(value) &&
		Array.isArray(value.content) &&
		value.content.every(isTextContent)
	);
}

function isToolsList(
	value: unknown,
): value is { tools: Array<{ name: string; description: string }> } {
	return (
		isRecord(value) &&
		Array.isArray(value.tools) &&
		value.tools.every(
			(tool) =>
				isRecord(tool) &&
				typeof tool.name === "string" &&
				typeof tool.description === "string",
		)
	);
}

function isPageInfo(value: unknown): value is {
	url: string;
	title: string;
	logs: Array<{ level: string; message: string; timestamp: number }>;
} {
	return (
		isRecord(value) &&
		typeof value.url === "string" &&
		typeof value.title === "string" &&
		Array.isArray(value.logs) &&
		value.logs.every(
			(log) =>
				isRecord(log) &&
				typeof log.level === "string" &&
				typeof log.message === "string" &&
				typeof log.timestamp === "number",
		)
	);
}

beforeAll(async () => {
	// JSDOM provides window, document, and localStorage natively.
	// We only need to mock specific missing APIs like fetch and WebSocket.
	originalFetch = window.fetch;
	window.fetch = async () => new Response();
	originalWebSocket = globalThis.WebSocket;
	Object.defineProperty(globalThis, "WebSocket", {
		configurable: true,
		value: WebSocket,
		writable: true,
	});

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

	client.connect();

	// Wait for client to register with server
	await new Promise((resolve) => setTimeout(resolve, 200));
});

afterAll(async () => {
	if (client) {
		client.disconnect();
	}
	if (server) {
		await server.close();
	}
	window.fetch = originalFetch;
	Object.defineProperty(globalThis, "WebSocket", {
		configurable: true,
		value: originalWebSocket,
		writable: true,
	});
});

async function sendMcpRequest(
	ws: WebSocket,
	method: string,
	params?: Record<string, unknown>,
	id = crypto.randomUUID(),
): Promise<unknown> {
	return new Promise((resolve, reject) => {
		const timeout = setTimeout(() => reject(new Error("Timeout")), 5000);
		const handler = (data: import("ws").RawData) => {
			const parsed: unknown = JSON.parse(data.toString());
			if (!isRecord(parsed) || parsed.id !== id) return;
			clearTimeout(timeout);
			ws.off("message", handler);
			if (isRecord(parsed.error) && typeof parsed.error.message === "string") {
				reject(new Error(parsed.error.message));
			} else if ("result" in parsed) {
				resolve(parsed.result);
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

	const result: unknown = await sendMcpRequest(mcp, "tools/call", {
		name: "browser_page_info",
		arguments: { logLimit: 10, logLevel: "all" },
	});
	if (!isToolResult(result)) throw new Error("Unexpected tool response");

	expect(result.content).toBeDefined();
	expect(result.content[0].type).toBe("text");

	const parsedPageInfo: unknown = JSON.parse(result.content[0].text);
	if (!isPageInfo(parsedPageInfo)) throw new Error("Unexpected page info");
	const pageInfo = parsedPageInfo;
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

	const listResult: unknown = await sendMcpRequest(mcp, "tools/list");
	if (!isToolsList(listResult)) throw new Error("Unexpected tools response");

	expect(listResult.tools).toBeDefined();
	const customTool = listResult.tools.find(
		(t) => t.name === "custom_redux_state",
	);
	expect(customTool).toBeDefined();
	expect(customTool?.description).toBe("Gets fake redux state");

	const callResult: unknown = await sendMcpRequest(mcp, "tools/call", {
		name: "custom_redux_state",
		arguments: {},
	});
	if (!isToolResult(callResult)) throw new Error("Unexpected tool response");

	expect(callResult.content).toBeDefined();
	expect(JSON.parse(callResult.content[0].text)).toEqual({ state: "faked" });

	mcp.close();
});
