import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { WebSocket } from "ws";
import { ApertureServer } from "../../src/server.js";
import { sendMcpRequest, waitForMessage } from "./helpers.js";

describe("ApertureServer Sessions", () => {
	let server: ApertureServer;
	const port = 4574;

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

	test("routes to most recently active session when multiple are approved", async () => {
		const b1 = new WebSocket(`ws://localhost:${port}/mcp?type=browser`);
		const b2 = new WebSocket(`ws://localhost:${port}/mcp?type=browser`);

		await Promise.all([
			new Promise<void>((resolve, reject) => {
				b1.on("open", resolve);
				b1.on("error", reject);
			}),
			new Promise<void>((resolve, reject) => {
				b2.on("open", resolve);
				b2.on("error", reject);
			}),
		]);

		b1.send(
			JSON.stringify({
				type: "register",
				url: "http://a.com",
				title: "Page A",
			}),
		);
		b2.send(
			JSON.stringify({
				type: "register",
				url: "http://b.com",
				title: "Page B",
			}),
		);

		await Promise.all([
			waitForMessage<any>(b1, (m) => m.type === "registered"),
			waitForMessage<any>(b2, (m) => m.type === "registered"),
		]);

		b1.send(
			JSON.stringify({
				type: "approval",
				approved: true,
				capabilities: ["console", "dom", "network", "storage"],
			}),
		);
		b2.send(
			JSON.stringify({
				type: "approval",
				approved: true,
				capabilities: ["console", "dom", "network", "storage"],
			}),
		);

		await new Promise((resolve) => setTimeout(resolve, 50));

		// Give b2 focus so it becomes the most recently active session
		b2.send(JSON.stringify({ type: "focus", focused: true }));
		await new Promise((resolve) => setTimeout(resolve, 50));

		const mcp = new WebSocket(`ws://localhost:${port}/mcp`);
		await new Promise<void>((resolve, reject) => {
			mcp.on("open", resolve);
			mcp.on("error", reject);
		});

		await sendMcpRequest(mcp, "initialize", {
			protocolVersion: "2024-11-05",
			capabilities: {},
			clientInfo: { name: "test", version: "1.0" },
		});

		// b2 should receive the tool call because it was focused last
		const toolCallPromise = waitForMessage<{
			type: string;
			requestId: string;
		}>(b2, (m) => m.type === "tool_call");

		const mcpResponsePromise = sendMcpRequest<{
			result: { content: Array<{ type: string; text: string }> };
		}>(mcp, "tools/call", {
			name: "browser_dom_query",
			arguments: { selector: "body" },
		});

		const toolCall = await toolCallPromise;
		expect((toolCall as any).tool).toBe("browser_dom_query");

		b2.send(
			JSON.stringify({
				type: "result",
				requestId: toolCall.requestId,
				result: [],
			}),
		);

		const mcpResponse = await mcpResponsePromise;
		expect(mcpResponse.result.content[0].type).toBe("text");

		b1.close();
		b2.close();
		mcp.close();
	});

	test("tool call with explicit sessionId routes to correct session", async () => {
		const browser = new WebSocket(`ws://localhost:${port}/mcp?type=browser`);
		await new Promise<void>((resolve, reject) => {
			browser.on("open", resolve);
			browser.on("error", reject);
		});

		browser.send(
			JSON.stringify({
				type: "register",
				url: "http://example.com",
				title: "Test",
			}),
		);

		const registered = await waitForMessage<{
			sessionId: string;
		}>(browser, (m: any) => m.type === "registered");

		browser.send(
			JSON.stringify({
				type: "approval",
				approved: true,
				capabilities: ["console", "dom", "network", "storage"],
			}),
		);

		await new Promise((resolve) => setTimeout(resolve, 50));

		const mcp = new WebSocket(`ws://localhost:${port}/mcp`);
		await new Promise<void>((resolve, reject) => {
			mcp.on("open", resolve);
			mcp.on("error", reject);
		});

		await sendMcpRequest(mcp, "initialize", {
			protocolVersion: "2024-11-05",
			capabilities: {},
			clientInfo: { name: "test", version: "1.0" },
		});

		const toolCallPromise = waitForMessage<{
			type: string;
			requestId: string;
		}>(browser, (m) => m.type === "tool_call");

		const mcpResponsePromise = sendMcpRequest<{
			result: { content: Array<{ type: string; text: string }> };
		}>(mcp, "tools/call", {
			name: "browser_dom_query",
			arguments: { selector: "body" },
			sessionId: registered.sessionId,
		});

		const toolCall = await toolCallPromise;
		browser.send(
			JSON.stringify({
				type: "result",
				requestId: toolCall.requestId,
				result: [],
			}),
		);

		const mcpResponse = await mcpResponsePromise;
		expect(mcpResponse.result.content[0].type).toBe("text");

		browser.close();
		mcp.close();
	});
});
