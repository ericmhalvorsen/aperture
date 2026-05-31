// @vitest-environment node
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import { WebSocket } from "ws";
import { ApertureServer } from "../src/server.js";

let ApertureClient: any;
let server: ApertureServer;
let client: any;
const port = 4568;

beforeAll(async () => {
	// Set up global mocks for Node environment before importing the client
	const store: Record<string, string> = {};
	const mockLocalStorage = {
		getItem: (key: string) => store[key] || null,
		setItem: (key: string, val: string) => {
			store[key] = String(val);
		},
		removeItem: (key: string) => {
			delete store[key];
		},
		clear: () => {
			for (const k in store) delete store[k];
		},
		key: (i: number) => Object.keys(store)[i] || null,
		get length() {
			return Object.keys(store).length;
		},
	};

	const mockDocument = {
		getElementById: () => null,
		createTextNode: (txt: string) => ({ textContent: txt }),
		createElement: (tag: string) => {
			if (tag === "style") return { id: "", textContent: "" };
			if (tag === "div")
				return {
					id: "",
					appendChild: () => {},
					querySelector: () => null,
					remove: () => {},
					addEventListener: () => {},
				};
			return { addEventListener: () => {} };
		},
		head: { appendChild: () => {} },
		body: {
			appendChild: () => {},
			get innerText() {
				return "Integration log message content";
			},
		},
		querySelectorAll: () => [],
		querySelector: () => null,
		cookie: "test-cookie=123",
	};

	global.window = {
		fetch: vi.fn(),
		location: { href: `http://localhost:${port}`, hostname: "localhost" },
		navigator: { userAgent: "NodeJS Test" },
		addEventListener: () => {},
		localStorage: mockLocalStorage,
		document: mockDocument,
		Event: class {},
		MouseEvent: class {},
	} as any;

	global.document = mockDocument as any;
	global.localStorage = mockLocalStorage as any;
	global.location = global.window.location;
	global.navigator = global.window.navigator;

	global.HTMLInputElement = class {} as any;
	global.HTMLTextAreaElement = class {} as any;
	global.WebSocket = WebSocket as any;
	global.window.WebSocket = WebSocket as any;

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
