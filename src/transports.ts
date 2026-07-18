import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import {
	type JSONRPCMessage,
	JSONRPCMessageSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { WebSocket } from "ws";

type WebSocketLike = {
	readyState: number;
	on(
		event: "message",
		listener: (raw: { toString(): string }) => void,
	): unknown;
	on(event: "close", listener: () => void): unknown;
	on(event: "error", listener: (error: Error) => void): unknown;
	send(data: string): void;
	close(): void;
};

type SseResponse = {
	on(event: "close", listener: () => void): unknown;
	write(chunk: string): unknown;
	end(): unknown;
};

type JsonRpcRequest = {
	on(event: "data", listener: (chunk: string | Buffer) => void): unknown;
	on(event: "end", listener: () => void): unknown;
	on(event: "error", listener: (error: Error) => void): unknown;
};

type JsonRpcErrorResponse = {
	writeHead(statusCode: number, headers: { "Content-Type": string }): unknown;
	end(chunk: string): unknown;
};

export class WebSocketTransport implements Transport {
	onclose?: () => void;
	onerror?: (error: Error) => void;
	onmessage?: (message: JSONRPCMessage) => void;
	sessionId: string;

	constructor(private ws: WebSocketLike) {
		this.sessionId = crypto.randomUUID();

		ws.on("message", (raw) => {
			try {
				const parsed: unknown = JSON.parse(raw.toString());
				const result = JSONRPCMessageSchema.safeParse(parsed);
				if (!result.success) {
					throw new Error("Invalid JSON-RPC message");
				}
				this.onmessage?.(result.data);
			} catch (err) {
				this.onerror?.(err instanceof Error ? err : new Error(String(err)));
			}
		});

		ws.on("close", () => {
			this.onclose?.();
		});

		ws.on("error", (err) => {
			this.onerror?.(err);
		});
	}

	async start(): Promise<void> {}

	async send(message: JSONRPCMessage): Promise<void> {
		if (this.ws.readyState === WebSocket.OPEN) {
			this.ws.send(JSON.stringify(message));
		}
	}

	async close(): Promise<void> {
		this.ws.close();
	}
}

export class SseTransport implements Transport {
	onclose?: () => void;
	onerror?: (error: Error) => void;
	onmessage?: (message: JSONRPCMessage) => void;
	sessionId: string;

	constructor(private res: SseResponse) {
		this.sessionId = crypto.randomUUID();

		res.on("close", () => {
			this.onclose?.();
		});
	}

	async start(): Promise<void> {}

	async send(message: JSONRPCMessage): Promise<void> {
		const data = JSON.stringify(message);
		this.res.write(`event: message\ndata: ${data}\n\n`);
	}

	async close(): Promise<void> {
		this.res.end();
	}

	receiveMessage(message: JSONRPCMessage): void {
		this.onmessage?.(message);
	}
}

export async function parseJsonRpcBody(
	req: JsonRpcRequest,
): Promise<JSONRPCMessage> {
	return new Promise((resolve, reject) => {
		let body = "";
		req.on("data", (chunk) => {
			body += chunk;
		});
		req.on("end", () => {
			try {
				const parsed: unknown = JSON.parse(body);
				const result = JSONRPCMessageSchema.safeParse(parsed);
				if (!result.success) {
					reject(new Error("Invalid JSON-RPC message"));
					return;
				}
				resolve(result.data);
			} catch (err) {
				reject(err);
			}
		});
		req.on("error", (err) => reject(err));
	});
}

export function writeParseError(res: JsonRpcErrorResponse): void {
	res.writeHead(400, { "Content-Type": "application/json" });
	res.end(
		JSON.stringify({
			jsonrpc: "2.0",
			id: null,
			error: { code: -32700, message: "Parse error" },
		}),
	);
}
