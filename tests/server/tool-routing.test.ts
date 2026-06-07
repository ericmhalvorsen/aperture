import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { WebSocket } from "ws";
import { ApertureServer } from "../../src/server.js";
import { sendMcpRequest, waitForMessage } from "./helpers.js";

describe("ApertureServer Tool routing", () => {
	let server: ApertureServer;
	const port = 4573;

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

	async function connectBrowser(
		customTools?: Array<{
			name: string;
			description: string;
			inputSchema: object;
		}>,
	) {
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
				customTools,
			}),
		);

		await waitForMessage<any>(browser, (m) => m.type === "registered");

		browser.send(
			JSON.stringify({
				type: "approval",
				approved: true,
				capabilities: ["console", "dom", "network", "storage"],
			}),
		);

		await new Promise((resolve) => setTimeout(resolve, 50));
		return browser;
	}

	async function connectMcp() {
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

		return mcp;
	}

	test("routes tool call to browser and returns result", async () => {
		const browser = await connectBrowser();
		const mcp = await connectMcp();

		const toolCallPromise = waitForMessage<{
			type: string;
			requestId: string;
			tool: string;
			args: object;
		}>(browser, (m) => m.type === "tool_call");

		const mcpResponsePromise = sendMcpRequest<{
			result: { content: Array<{ type: string; text: string }> };
		}>(mcp, "tools/call", {
			name: "browser_dom_query",
			arguments: { selector: "body" },
		});

		const toolCall = await toolCallPromise;
		expect(toolCall.tool).toBe("browser_dom_query");

		browser.send(
			JSON.stringify({
				type: "result",
				requestId: toolCall.requestId,
				result: [{ level: "log", message: "hello", timestamp: 1 }],
			}),
		);

		const mcpResponse = await mcpResponsePromise;
		expect(mcpResponse.result.content[0].type).toBe("text");

		browser.close();
		mcp.close();
	});

	test("custom tools appear in tools/list", async () => {
		const browser = await connectBrowser([
			{
				name: "custom_test_tool",
				description: "A custom test tool",
				inputSchema: { type: "object", properties: {} },
			},
		]);
		const mcp = await connectMcp();

		const list = await sendMcpRequest<{
			result: { tools: Array<{ name: string }> };
		}>(mcp, "tools/list");

		const names = list.result.tools.map((t) => t.name);
		expect(names).toContain("custom_test_tool");

		browser.close();
		mcp.close();
	});

	test("custom tool call routes to browser", async () => {
		const browser = await connectBrowser([
			{
				name: "custom_echo",
				description: "Echo input",
				inputSchema: { type: "object", properties: {} },
			},
		]);
		const mcp = await connectMcp();

		const toolCallPromise = waitForMessage<{
			type: string;
			requestId: string;
			tool: string;
		}>(browser, (m) => m.type === "tool_call");

		const mcpResponsePromise = sendMcpRequest<{
			result: { content: Array<{ type: string; text: string }> };
		}>(mcp, "tools/call", {
			name: "custom_echo",
			arguments: { text: "hello" },
		});

		const toolCall = await toolCallPromise;
		expect(toolCall.tool).toBe("custom_echo");

		browser.send(
			JSON.stringify({
				type: "result",
				requestId: toolCall.requestId,
				result: { echoed: "hello" },
			}),
		);

		const mcpResponse = await mcpResponsePromise;
		const parsed = JSON.parse(mcpResponse.result.content[0].text);
		expect(parsed.echoed).toBe("hello");

		browser.close();
		mcp.close();
	});

	test("browser_evaluate requires evaluate capability", async () => {
		// connectBrowser defaults to no evaluate
		const browser = await connectBrowser();
		const mcp = await connectMcp();

		const res = await sendMcpRequest<{
			result: {
				content: Array<{ type: string; text: string }>;
				isError: boolean;
			};
		}>(mcp, "tools/call", {
			name: "browser_evaluate",
			arguments: { expression: "1+1" },
		});

		expect(res.result.isError).toBe(true);
		expect(res.result.content[0].text).toContain("requires explicit approval");

		browser.close();
		mcp.close();
	});
});
