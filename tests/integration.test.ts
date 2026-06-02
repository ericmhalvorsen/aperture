// @vitest-environment jsdom
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import { WebSocket } from "ws";
import { ApertureServer } from "../src/server.js";

let ApertureClient: any;
let server: ApertureServer;
let client: any;
const port = 4568;

beforeAll(async () => {
	// JSDOM provides window, document, and localStorage natively.
	// We only need to mock specific missing APIs like fetch and WebSocket.
	global.window.fetch = vi.fn() as any;
	global.window.WebSocket = WebSocket as any;
	global.WebSocket = WebSocket as any;

	// Dynamically import client now that mock globals are active
	const clientModule = await import("../src/client.js");
	ApertureClient = clientModule.ApertureClient;

	// Start Server
	server = new ApertureServer(port);

	// Start Client
	client = new ApertureClient({
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

	// Initialize MCP session to trigger client approval
	const initRequest = {
		jsonrpc: "2.0" as const,
		id: "mcp-init-1",
		method: "initialize",
		params: {
			protocolVersion: "2024-11-05",
			capabilities: {},
			clientInfo: { name: "test-client", version: "1.0.0" },
		},
	};
	await new Promise<any>((resolve) => {
		(server as any).handleMCPRequest(initRequest, resolve);
	});

	// Give handshake time to complete
	await new Promise((resolve) => setTimeout(resolve, 150));
});

afterAll(() => {
	if (client) {
		client.disconnect();
	}
	if (server) {
		(server as any).wss.close();
		if ((server as any).wss.options.server) {
			(server as any).wss.options.server.close();
		}
	}
});

test("routes tool calls from MCP to client and returns results", async () => {
	// Print a console log in node context to trigger console buffering
	console.log("Integrative Test Log Payload");

	// Simulate MCP tool call request
	const request = {
		jsonrpc: "2.0" as const,
		id: "mcp-req-1",
		method: "tools/call",
		params: {
			name: "browser_console_logs",
			arguments: {
				limit: 10,
				level: "all",
			},
		},
	};

	// Call the server's MCP request handler directly and capture response
	const responsePromise = new Promise<any>((resolve) => {
		(server as any).handleMCPRequest(request, (res: any) => {
			resolve(res);
		});
	});

	const response = await responsePromise;

	// Assert JSON-RPC payload correctness
	expect(response.jsonrpc).toBe("2.0");
	expect(response.id).toBe("mcp-req-1");
	expect(response.result).toBeDefined();

	// Assert actual data integration: checking if the logged text is in the returned list
	const logs = response.result as Array<{
		level: string;
		message: string;
		timestamp: number;
	}>;
	expect(Array.isArray(logs)).toBe(true);

	const matchingLog = logs.find((log) =>
		log.message.includes("Integrative Test Log Payload"),
	);
	expect(matchingLog).toBeDefined();
	expect(matchingLog?.level).toBe("log");
});

test("exposes custom tools in tools/list and routes custom tool calls", async () => {
	// Request tools/list to verify custom tool is exposed
	const listRequest = {
		jsonrpc: "2.0" as const,
		id: "mcp-list-1",
		method: "tools/list",
	};

	const listPromise = new Promise<any>((resolve) => {
		(server as any).handleMCPRequest(listRequest, resolve);
	});
	const listResponse = await listPromise;

	expect(listResponse.result.tools).toBeDefined();
	const customTool = listResponse.result.tools.find(
		(t: any) => t.name === "custom_redux_state",
	);
	expect(customTool).toBeDefined();
	expect(customTool.description).toBe("Gets fake redux state");

	// Call the custom tool
	const callRequest = {
		jsonrpc: "2.0" as const,
		id: "mcp-req-2",
		method: "tools/call",
		params: {
			name: "custom_redux_state",
			arguments: {},
		},
	};

	const callPromise = new Promise<any>((resolve) => {
		(server as any).handleMCPRequest(callRequest, resolve);
	});
	const callResponse = await callPromise;

	expect(callResponse.jsonrpc).toBe("2.0");
	expect(callResponse.id).toBe("mcp-req-2");
	expect(callResponse.result).toEqual({ state: "faked" });
});
