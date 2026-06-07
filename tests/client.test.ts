// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { ApertureClient } from "../src/client.js";

// Mock WebSocket globally since jsdom does not include it
class MockWebSocket {
	static CONNECTING = 0;
	static OPEN = 1;
	static CLOSING = 2;
	static CLOSED = 3;

	url: string;
	readyState = 0; // CONNECTING
	onopen: (() => void) | null = null;
	onclose: (() => void) | null = null;
	onmessage: ((event: { data: string }) => void) | null = null;
	send = vi.fn();
	close = vi.fn();

	constructor(url: string) {
		this.url = url;
		// Trigger onopen asynchronously to simulate connection
		setTimeout(() => {
			this.readyState = 1; // OPEN
			if (this.onopen) this.onopen();
		}, 5);
	}
}

describe("ApertureClient", () => {
	let originalWebSocket: any;
	let originalFetch: any;

	beforeEach(() => {
		originalWebSocket = (window as any).WebSocket;
		(window as any).WebSocket = MockWebSocket;
		(global as any).WebSocket = MockWebSocket;
		(globalThis as any).WebSocket = MockWebSocket;

		originalFetch = window.fetch;
		window.fetch = vi.fn().mockResolvedValue({
			status: 200,
			text: () => Promise.resolve("ok"),
		});

		document.body.innerHTML = "";
	});

	afterEach(() => {
		(window as any).WebSocket = originalWebSocket;
		(global as any).WebSocket = originalWebSocket;
		(globalThis as any).WebSocket = originalWebSocket;

		window.fetch = originalFetch;

		const styles = document.getElementById("aperture-styles");
		styles?.remove();
		const badge = document.getElementById("aperture-badge");
		badge?.remove();
		const overlay = document.getElementById("aperture-dialog-overlay");
		overlay?.remove();
	});

	test("initializes, connects, and sends registration", async () => {
		const client = new ApertureClient({ serverUrl: "ws://localhost:3456" });
		client.connect();

		// Wait for open simulation
		await new Promise((resolve) => setTimeout(resolve, 15));

		const activeSocket = (client as any).ws as MockWebSocket;
		expect(activeSocket).toBeDefined();
		expect(activeSocket.send).toHaveBeenCalled();

		const registerMsg = JSON.parse(activeSocket.send.mock.calls[0][0]);
		expect(registerMsg.type).toBe("register");
		expect(registerMsg.url).toBe(window.location.href);

		client.disconnect();
	});

	test("buffers console logs correctly", () => {
		const originalLog = console.log;
		const logSpy = vi.fn();
		console.log = logSpy;

		const client = new ApertureClient({ serverUrl: "ws://localhost:3456" });

		console.log("Aperture test log");

		expect(logSpy).toHaveBeenCalledWith("Aperture test log");
		console.log = originalLog;
		client.disconnect();
	});

	test("clicks elements in DOM", async () => {
		const client = new ApertureClient({ serverUrl: "ws://localhost:3456" });

		const btn = document.createElement("button");
		btn.id = "test-btn";
		let clicked = false;
		btn.addEventListener("click", () => {
			clicked = true;
		});
		document.body.appendChild(btn);

		client.connect();
		await new Promise((resolve) => setTimeout(resolve, 15));

		// Mock approval so we can run the tool
		(client as any).approved = true;

		await (client as any).handleToolCall({
			requestId: "req-1",
			tool: "browser_click",
			args: { selector: "#test-btn" },
		});

		expect(clicked).toBe(true);
		client.disconnect();
	});

	test("types text in input", async () => {
		const client = new ApertureClient({ serverUrl: "ws://localhost:3456" });

		const input = document.createElement("input");
		input.id = "test-input";
		document.body.appendChild(input);

		client.connect();
		await new Promise((resolve) => setTimeout(resolve, 15));
		(client as any).approved = true;

		await (client as any).handleToolCall({
			requestId: "req-2",
			tool: "browser_type",
			args: { selector: "#test-input", text: "Aperture input value" },
		});

		expect(input.value).toBe("Aperture input value");
		client.disconnect();
	});

	test("persists denial state", async () => {
		const client = new ApertureClient({
			serverUrl: "ws://localhost:3456",
			onApprovalRequest: () =>
				Promise.resolve({ approved: false, capabilities: [] }),
		});

		client.connect();
		await new Promise((resolve) => setTimeout(resolve, 15));

		// First call prompts and sets denied
		await (client as any).handleToolCall({
			requestId: "req-3",
			tool: "browser_console_logs",
			args: { limit: 10 },
		});

		expect((client as any).approved).toBe(false);
		expect((client as any).denied).toBe(true);

		// Second call rejects immediately without calling approval dialog
		const approvalSpy = vi.spyOn(client as any, "getApproval");

		await (client as any).handleToolCall({
			requestId: "req-4",
			tool: "browser_console_logs",
			args: { limit: 10 },
		});

		expect(approvalSpy).not.toHaveBeenCalled();
		client.disconnect();
	});
});
