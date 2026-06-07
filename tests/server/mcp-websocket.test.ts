import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { WebSocket } from "ws";
import { ApertureServer } from "../../src/server.js";
import { sendMcpRequest } from "./helpers.js";

describe("ApertureServer MCP over WebSocket", () => {
	let server: ApertureServer;
	const port = 4571;

	beforeAll(() => {
		server = new ApertureServer(port, { silentStartup: true });
	});

	afterAll(() => {
		// @ts-expect-error accessing private for cleanup
		server.wss.close();
		// @ts-expect-error accessing private for cleanup
		if (server.wss.options.server) {
			// @ts-expect-error accessing private for cleanup
			server.wss.options.server.close();
		}
	});

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

		const res = await sendMcpRequest<{
			id: string;
			result: {
				protocolVersion: string;
				serverInfo: { name: string; version: string };
				capabilities: { tools?: object };
			};
		}>(ws, "initialize", {
			protocolVersion: "2024-11-05",
			capabilities: {},
			clientInfo: { name: "test", version: "1.0" },
		});

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

		const list = await sendMcpRequest<{
			result: { tools: Array<{ name: string; description: string }> };
		}>(ws, "tools/list");

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

		const res = await sendMcpRequest<{
			error: { code: number; message: string };
		}>(ws, "tools/unknown");

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

		const res = await sendMcpRequest<{
			result: {
				content: Array<{ type: string; text: string }>;
				isError: boolean;
			};
		}>(ws, "tools/call", {
			name: "browser_nonexistent",
			arguments: {},
		});

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

		const res = await sendMcpRequest<{
			result: { content: Array<{ type: string; text: string }> };
		}>(ws, "tools/call", {
			name: "browser_list_sessions",
			arguments: {},
		});

		const parsed = JSON.parse(res.result.content[0].text) as {
			sessions: Array<unknown>;
		};
		expect(Array.isArray(parsed.sessions)).toBe(true);
		expect(parsed.sessions.length).toBe(0);

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

		const res = await sendMcpRequest<{
			result: {
				content: Array<{ type: string; text: string }>;
				isError: boolean;
			};
		}>(ws, "tools/call", {
			name: "browser_dom_query",
			arguments: { selector: "body" },
		});

		expect(res.result.isError).toBe(true);
		expect(res.result.content[0].text).toContain(
			"No browser session connected",
		);

		ws.close();
	});
});
