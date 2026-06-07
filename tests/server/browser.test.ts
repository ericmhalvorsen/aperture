import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { WebSocket } from "ws";
import { ApertureServer } from "../../src/server.js";
import { sendMcpRequest, waitForMessage } from "./helpers.js";

describe("ApertureServer Browser lifecycle", () => {
	let server: ApertureServer;
	const port = 4572;

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

	test("browser registers and receives sessionId", async () => {
		const ws = new WebSocket(`ws://localhost:${port}/mcp?type=browser`);

		await new Promise<void>((resolve, reject) => {
			ws.on("open", resolve);
			ws.on("error", reject);
		});

		ws.send(
			JSON.stringify({
				type: "register",
				url: "http://example.com/test",
				title: "Test Page",
			}),
		);

		const msg = await waitForMessage<{
			type: string;
			sessionId: string;
		}>(ws, (m) => m.type === "registered");

		expect(msg.sessionId).toBeDefined();
		expect(typeof msg.sessionId).toBe("string");

		ws.close();
	});

	test("browser gets agent_connected after MCP init", async () => {
		const browser = new WebSocket(`ws://localhost:${port}/mcp?type=browser`);
		await new Promise<void>((resolve, reject) => {
			browser.on("open", resolve);
			browser.on("error", reject);
		});

		browser.send(
			JSON.stringify({
				type: "register",
				url: "http://example.com/test",
				title: "Test Page",
			}),
		);

		await waitForMessage<any>(browser, (m) => m.type === "registered");

		const mcp = new WebSocket(`ws://localhost:${port}/mcp`);
		await new Promise<void>((resolve, reject) => {
			mcp.on("open", resolve);
			mcp.on("error", reject);
		});

		const agentConnectedPromise = waitForMessage<{
			type: string;
		}>(browser, (m) => m.type === "agent_connected", 1000);

		await sendMcpRequest(mcp, "initialize", {
			protocolVersion: "2024-11-05",
			capabilities: {},
			clientInfo: { name: "test", version: "1.0" },
		});

		const msg = await agentConnectedPromise;
		expect(msg.type).toBe("agent_connected");

		browser.close();
		mcp.close();
	});
});
