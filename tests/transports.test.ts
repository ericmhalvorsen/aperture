import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { afterEach, describe, expect, test, vi } from "vitest";
import { WebSocket } from "ws";
import {
	parseJsonRpcBody,
	SseTransport,
	WebSocketTransport,
	writeParseError,
} from "../src/transports.js";

class FakeWebSocket extends EventEmitter {
	readyState: number = WebSocket.OPEN;
	send = vi.fn();
	close = vi.fn();
}

class FakeResponse extends EventEmitter {
	write = vi.fn();
	end = vi.fn();
}

afterEach(() => {
	vi.restoreAllMocks();
});

describe("WebSocketTransport", () => {
	test("forwards parsed messages and reports malformed messages", () => {
		const socket = new FakeWebSocket();
		const transport = new WebSocketTransport(socket);
		const onMessage = vi.fn();
		const onError = vi.fn();
		transport.onmessage = onMessage;
		transport.onerror = onError;

		socket.emit("message", Buffer.from('{"jsonrpc":"2.0","method":"ping"}'));
		socket.emit("message", Buffer.from("not json"));

		expect(onMessage).toHaveBeenCalledWith({
			jsonrpc: "2.0",
			method: "ping",
		});
		expect(onError).toHaveBeenCalledWith(expect.any(Error));
	});

	test("sends only while the socket is open and closes the socket", async () => {
		const socket = new FakeWebSocket();
		const transport = new WebSocketTransport(socket);

		await transport.send({ jsonrpc: "2.0", method: "ping" });
		expect(socket.send).toHaveBeenCalledWith(
			JSON.stringify({ jsonrpc: "2.0", method: "ping" }),
		);

		socket.readyState = WebSocket.CLOSED;
		await transport.send({ jsonrpc: "2.0", method: "ignored" });
		expect(socket.send).toHaveBeenCalledTimes(1);

		await transport.close();
		expect(socket.close).toHaveBeenCalledOnce();
	});

	test("forwards socket close events", () => {
		const socket = new FakeWebSocket();
		const transport = new WebSocketTransport(socket);
		const onClose = vi.fn();
		transport.onclose = onClose;

		socket.emit("close");

		expect(onClose).toHaveBeenCalledOnce();
	});
});

describe("SseTransport", () => {
	test("writes messages and receives incoming messages", async () => {
		const response = new FakeResponse();
		const transport = new SseTransport(response);
		const onMessage = vi.fn();
		transport.onmessage = onMessage;

		await transport.send({ jsonrpc: "2.0", method: "ping" });
		transport.receiveMessage({ jsonrpc: "2.0", method: "pong" });

		expect(response.write).toHaveBeenCalledWith(
			`event: message\ndata: ${JSON.stringify({ jsonrpc: "2.0", method: "ping" })}\n\n`,
		);
		expect(onMessage).toHaveBeenCalledWith({
			jsonrpc: "2.0",
			method: "pong",
		});
	});

	test("ends the response and forwards close events", async () => {
		const response = new FakeResponse();
		const transport = new SseTransport(response);
		const onClose = vi.fn();
		transport.onclose = onClose;

		await transport.close();
		response.emit("close");

		expect(response.end).toHaveBeenCalledOnce();
		expect(onClose).toHaveBeenCalledOnce();
	});
});

describe("JSON-RPC request helpers", () => {
	test("parses a valid request body", async () => {
		const request = new PassThrough();
		const resultPromise = parseJsonRpcBody(request);
		request.end('{"jsonrpc":"2.0","id":1,"method":"ping"}');

		expect(await resultPromise).toEqual({
			jsonrpc: "2.0",
			id: 1,
			method: "ping",
		});
	});

	test("rejects malformed request bodies", async () => {
		const request = new PassThrough();
		const resultPromise = parseJsonRpcBody(request);
		request.end("not json");

		await expect(resultPromise).rejects.toThrow(SyntaxError);
	});

	test("writes a JSON-RPC parse error response", () => {
		const response = {
			writeHead: vi.fn(),
			end: vi.fn(),
		};

		writeParseError(response);

		expect(response.writeHead).toHaveBeenCalledWith(400, {
			"Content-Type": "application/json",
		});
		expect(response.end).toHaveBeenCalledWith(
			JSON.stringify({
				jsonrpc: "2.0",
				id: null,
				error: { code: -32700, message: "Parse error" },
			}),
		);
	});
});
