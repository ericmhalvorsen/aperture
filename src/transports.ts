import type { IncomingMessage, ServerResponse } from "node:http";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import type { JSONRPCMessage } from "@modelcontextprotocol/sdk/types.js";
import { WebSocket } from "ws";

export class WebSocketTransport implements Transport {
	onclose?: () => void;
	onerror?: (error: Error) => void;
	onmessage?: (message: JSONRPCMessage) => void;
	sessionId: string;

	constructor(private ws: WebSocket) {
		this.sessionId = crypto.randomUUID();

		ws.on("message", (raw) => {
			try {
				const msg = JSON.parse(raw.toString()) as JSONRPCMessage;
				this.onmessage?.(msg);
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

	constructor(private res: ServerResponse) {
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
	req: IncomingMessage,
): Promise<JSONRPCMessage> {
	return new Promise((resolve, reject) => {
		let body = "";
		req.on("data", (chunk) => {
			body += chunk;
		});
		req.on("end", () => {
			try {
				resolve(JSON.parse(body) as JSONRPCMessage);
			} catch (err) {
				reject(err);
			}
		});
		req.on("error", (err) => reject(err));
	});
}

export function writeParseError(res: ServerResponse): void {
	res.writeHead(400, { "Content-Type": "application/json" });
	res.end(
		JSON.stringify({
			jsonrpc: "2.0",
			id: null,
			error: { code: -32700, message: "Parse error" },
		}),
	);
}
