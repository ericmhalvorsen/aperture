import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { WebSocket } from "ws";
import { ApertureServer } from "../../src/server.js";
import {
	isInitializeResponse,
	isRpcErrorResponse,
	isToolResultResponse,
	isToolsListResponse,
	sendMcpRequest,
} from "./helpers.js";

function isSessionList(value: unknown): value is { sessions: unknown[] } {
	return (
		typeof value === "object" &&
		value !== null &&
		"sessions" in value &&
		Array.isArray(value.sessions)
	);
}

describe("ApertureServer MCP over WebSocket", () => {
	let server: ApertureServer;
	const port = 4571;

	beforeAll(() => {
		server = new ApertureServer(port, { silentStartup: true });
	});

	afterAll(() => server.close());

	test("allows WebSocket connections on /mcp", async () => {
		const ws = new WebSocket(`ws://localhost:${port}/mcp`);
		await new Promise<void>((resolve, reject) => {
			ws.on("open", () => {
				expect(ws.readyState).toBe(WebSocket.OPEN);
				ws.close();
				resolve();
			});
			ws.on("error", reject);
		});
	});

	test("initialize returns protocol version and server info", async () => {
		const ws = new WebSocket(`ws://localhost:${port}/mcp`);
		await new Promise<void>((resolve, reject) => {
			ws.on("open", resolve);
			ws.on("error", reject);
		});

		const res = await sendMcpRequest(
			ws,
			"initialize",
			{
				protocolVersion: "2024-11-05",
				capabilities: {},
				clientInfo: { name: "test", version: "1.0" },
			},
			undefined,
			isInitializeResponse,
		);

		expect(res.result.protocolVersion).toBe("2024-11-05");
		expect(res.result.serverInfo.name).toBe("aperture");
		expect(res.result.capabilities.tools).toBeDefined();

		ws.close();
	});

	test("tools/list returns built-in browser tools", async () => {
		const ws = new WebSocket(`ws://localhost:${port}/mcp`);
		await new Promise<void>((resolve, reject) => {
			ws.on("open", resolve);
			ws.on("error", reject);
		});

		await sendMcpRequest(ws, "initialize", {
			protocolVersion: "2024-11-05",
			capabilities: {},
			clientInfo: { name: "test", version: "1.0" },
		});

		const list = await sendMcpRequest(
			ws,
			"tools/list",
			undefined,
			undefined,
			isToolsListResponse,
		);

		const names = list.result.tools.map((t) => t.name);
		expect(names).toContain("browser_dom_query");
		expect(names).toContain("browser_page_info");
		expect(names).toContain("browser_screenshot");
		expect(names).toContain("browser_evaluate");

		ws.close();
	});

	test("unknown method returns Method not found", async () => {
		const ws = new WebSocket(`ws://localhost:${port}/mcp`);
		await new Promise<void>((resolve, reject) => {
			ws.on("open", resolve);
			ws.on("error", reject);
		});

		const res = await sendMcpRequest(
			ws,
			"tools/unknown",
			undefined,
			undefined,
			isRpcErrorResponse,
		);

		expect(res.error.code).toBe(-32601);
		expect(res.error.message).toBe("Method not found");

		ws.close();
	});

	test("unknown tool returns Tool not found", async () => {
		const ws = new WebSocket(`ws://localhost:${port}/mcp`);
		await new Promise<void>((resolve, reject) => {
			ws.on("open", resolve);
			ws.on("error", reject);
		});

		await sendMcpRequest(ws, "initialize", {
			protocolVersion: "2024-11-05",
			capabilities: {},
			clientInfo: { name: "test", version: "1.0" },
		});

		const res = await sendMcpRequest(
			ws,
			"tools/call",
			{
				name: "browser_nonexistent",
				arguments: {},
			},
			undefined,
			isToolResultResponse,
		);

		expect(res.result.isError).toBe(true);
		expect(res.result.content[0].text).toContain("Tool not found");

		ws.close();
	});

	test("browser_list_sessions works with no sessions", async () => {
		const ws = new WebSocket(`ws://localhost:${port}/mcp`);
		await new Promise<void>((resolve, reject) => {
			ws.on("open", resolve);
			ws.on("error", reject);
		});

		await sendMcpRequest(ws, "initialize", {
			protocolVersion: "2024-11-05",
			capabilities: {},
			clientInfo: { name: "test", version: "1.0" },
		});

		const res = await sendMcpRequest(
			ws,
			"tools/call",
			{
				name: "browser_list_sessions",
				arguments: {},
			},
			undefined,
			isToolResultResponse,
		);

		const parsed: unknown = JSON.parse(res.result.content[0].text);
		expect(isSessionList(parsed)).toBe(true);
		if (isSessionList(parsed)) expect(parsed.sessions).toHaveLength(0);

		ws.close();
	});

	test("tools/call with no browser returns error", async () => {
		const ws = new WebSocket(`ws://localhost:${port}/mcp`);
		await new Promise<void>((resolve, reject) => {
			ws.on("open", resolve);
			ws.on("error", reject);
		});

		await sendMcpRequest(ws, "initialize", {
			protocolVersion: "2024-11-05",
			capabilities: {},
			clientInfo: { name: "test", version: "1.0" },
		});

		const res = await sendMcpRequest(
			ws,
			"tools/call",
			{
				name: "browser_dom_query",
				arguments: { selector: "body" },
			},
			undefined,
			isToolResultResponse,
		);

		expect(res.result.isError).toBe(true);
		expect(res.result.content[0].text).toContain(
			"No browser session connected",
		);

		ws.close();
	});
});
