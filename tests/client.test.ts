// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { ApertureClient } from "../src/client.js";

// Mock WebSocket globally since jsdom does not include it
class MockWebSocket {
	static instances: MockWebSocket[] = [];
	static CONNECTING = 0;
	static OPEN = 1;
	static CLOSING = 2;
	static CLOSED = 3;

	url: string;
	readyState = 0; // CONNECTING
	onopen: (() => void) | null = null;
	onclose: (() => void) | null = null;
	onmessage: ((event: { data: string }) => void | Promise<void>) | null = null;
	send = vi.fn<(data: string) => void>();
	close = vi.fn<() => void>();

	constructor(url: string) {
		this.url = url;
		MockWebSocket.instances.push(this);
		// Trigger onopen asynchronously to simulate connection
		setTimeout(() => {
			this.readyState = 1; // OPEN
			if (this.onopen) this.onopen();
		}, 5);
	}
}

function latestSocket(): MockWebSocket {
	const socket = MockWebSocket.instances.at(-1);
	if (!socket) throw new Error("No mock WebSocket instance");
	return socket;
}

function parseMessage(data: string): Record<string, unknown> {
	const parsed: unknown = JSON.parse(data);
	if (!isRecord(parsed)) {
		throw new Error("Expected a JSON object");
	}
	return parsed;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

async function sendToolCall(
	socket: MockWebSocket,
	tool: string,
	args: Record<string, unknown>,
): Promise<void> {
	await socket.onmessage?.({
		data: JSON.stringify({
			type: "tool_call",
			requestId: crypto.randomUUID(),
			tool,
			args,
		}),
	});
}

describe("ApertureClient", () => {
	let originalWebSocket: typeof globalThis.WebSocket;
	let originalFetch: typeof window.fetch;

	beforeEach(() => {
		MockWebSocket.instances = [];
		originalWebSocket = globalThis.WebSocket;
		Object.defineProperty(globalThis, "WebSocket", {
			configurable: true,
			value: MockWebSocket,
			writable: true,
		});

		originalFetch = window.fetch;
		window.fetch = async () => new Response();

		document.body.innerHTML = "";
		localStorage.clear();
	});

	afterEach(() => {
		Object.defineProperty(globalThis, "WebSocket", {
			configurable: true,
			value: originalWebSocket,
			writable: true,
		});

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
		expect(document.getElementById("aperture-badge")).toBeNull();

		// Wait for open simulation
		await new Promise((resolve) => setTimeout(resolve, 15));

		const activeSocket = latestSocket();
		expect(activeSocket).toBeDefined();
		expect(activeSocket.send).toHaveBeenCalled();

		const registerMsg = parseMessage(activeSocket.send.mock.calls[0][0]);
		expect(registerMsg.type).toBe("register");
		expect(registerMsg.url).toBe(window.location.href);
		expect(document.getElementById("aperture-badge")).not.toBeNull();

		client.disconnect();
		expect(document.getElementById("aperture-badge")).toBeNull();
	});

	test("colors the badge by approval status", async () => {
		const approvalRequest = vi
			.fn<() => Promise<{ approved: boolean; capabilities: string[] }>>()
			.mockResolvedValue({ approved: true, capabilities: [] });
		const client = new ApertureClient({
			serverUrl: "ws://localhost:3456",
			onApprovalRequest: approvalRequest,
		});
		client.connect();
		await new Promise((resolve) => setTimeout(resolve, 15));

		expect(
			document
				.querySelector("#aperture-badge .dot")
				?.classList.contains("pending"),
		).toBe(true);

		await sendToolCall(latestSocket(), "browser_console_logs", { limit: 10 });
		expect(
			document
				.querySelector("#aperture-badge .dot")
				?.classList.contains("approved"),
		).toBe(true);

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
		const client = new ApertureClient({
			serverUrl: "ws://localhost:3456",
			onApprovalRequest: () =>
				Promise.resolve({ approved: true, capabilities: [] }),
		});

		const btn = document.createElement("button");
		btn.id = "test-btn";
		let clicked = false;
		btn.addEventListener("click", () => {
			clicked = true;
		});
		document.body.appendChild(btn);

		client.connect();
		await new Promise((resolve) => setTimeout(resolve, 15));

		await sendToolCall(latestSocket(), "browser_click", {
			selector: "#test-btn",
		});

		expect(clicked).toBe(true);
		client.disconnect();
	});

	test("types text in input", async () => {
		const client = new ApertureClient({
			serverUrl: "ws://localhost:3456",
			onApprovalRequest: () =>
				Promise.resolve({ approved: true, capabilities: [] }),
		});

		const input = document.createElement("input");
		input.id = "test-input";
		document.body.appendChild(input);

		client.connect();
		await new Promise((resolve) => setTimeout(resolve, 15));
		await sendToolCall(latestSocket(), "browser_type", {
			selector: "#test-input",
			text: "Aperture input value",
		});

		expect(input.value).toBe("Aperture input value");
		client.disconnect();
	});

	test("persists denial state", async () => {
		const approvalRequest = vi
			.fn<() => Promise<{ approved: boolean; capabilities: string[] }>>()
			.mockResolvedValueOnce({ approved: false, capabilities: [] })
			.mockResolvedValueOnce({ approved: true, capabilities: [] });
		const client = new ApertureClient({
			serverUrl: "ws://localhost:3456",
			onApprovalRequest: approvalRequest,
		});

		client.connect();
		await new Promise((resolve) => setTimeout(resolve, 15));

		const socket = latestSocket();
		await sendToolCall(socket, "browser_console_logs", { limit: 10 });
		expect(approvalRequest).toHaveBeenCalledOnce();

		document
			.getElementById("aperture-badge")
			?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
		document
			.getElementById("aperture-status-btn-revoke")
			?.dispatchEvent(new MouseEvent("click", { bubbles: true }));

		await sendToolCall(socket, "browser_console_logs", { limit: 10 });

		expect(approvalRequest).toHaveBeenCalledTimes(2);
		client.disconnect();
	});
});
