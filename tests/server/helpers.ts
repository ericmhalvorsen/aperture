import http from "node:http";
import type { WebSocket } from "ws";

export interface RegisteredMessage {
	type: "registered";
	sessionId: string;
}

export interface AgentConnectedMessage {
	type: "agent_connected";
}

export interface ToolCallMessage {
	type: "tool_call";
	requestId: string;
	tool: string;
	args: Record<string, unknown>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

type RpcEnvelope<T> = { id: string | number; result: T };

type TextContent = { type: string; text: string };

export type ToolResult = {
	content: TextContent[];
	isError?: boolean;
};

export type ToolsListResult = {
	tools: Array<{ name: string; description: string }>;
};

export type InitializeResult = {
	protocolVersion: string;
	serverInfo: { name: string; version: string };
	capabilities: { tools?: object };
};

export type RpcErrorResponse = {
	id: string | number;
	error: { code: number; message: string };
};

function isTextContent(value: unknown): value is TextContent {
	return (
		isRecord(value) &&
		typeof value.type === "string" &&
		typeof value.text === "string"
	);
}

function isRpcEnvelope(value: unknown): value is RpcEnvelope<unknown> {
	return (
		isRecord(value) &&
		(typeof value.id === "string" || typeof value.id === "number") &&
		"result" in value
	);
}

export function isInitializeResponse(
	value: unknown,
): value is RpcEnvelope<InitializeResult> {
	if (!isRpcEnvelope(value) || !isRecord(value.result)) return false;
	const result = value.result;
	return (
		typeof result.protocolVersion === "string" &&
		isRecord(result.serverInfo) &&
		typeof result.serverInfo.name === "string" &&
		typeof result.serverInfo.version === "string" &&
		isRecord(result.capabilities)
	);
}

export function isToolsListResponse(
	value: unknown,
): value is RpcEnvelope<ToolsListResult> {
	if (!isRpcEnvelope(value) || !isRecord(value.result)) return false;
	const tools = value.result.tools;
	return (
		Array.isArray(tools) &&
		tools.every(
			(tool) =>
				isRecord(tool) &&
				typeof tool.name === "string" &&
				typeof tool.description === "string",
		)
	);
}

export function isToolResultResponse(
	value: unknown,
): value is RpcEnvelope<ToolResult> {
	if (!isRpcEnvelope(value) || !isRecord(value.result)) return false;
	const result = value.result;
	return (
		Array.isArray(result.content) &&
		result.content.every(isTextContent) &&
		(result.isError === undefined || typeof result.isError === "boolean")
	);
}

export function isRpcErrorResponse(value: unknown): value is RpcErrorResponse {
	if (
		!isRecord(value) ||
		(typeof value.id !== "string" && typeof value.id !== "number")
	) {
		return false;
	}
	return (
		isRecord(value.error) &&
		typeof value.error.code === "number" &&
		typeof value.error.message === "string"
	);
}

export function isRegisteredMessage(
	value: unknown,
): value is RegisteredMessage {
	return (
		isRecord(value) &&
		value.type === "registered" &&
		typeof value.sessionId === "string"
	);
}

export function isAgentConnectedMessage(
	value: unknown,
): value is AgentConnectedMessage {
	return isRecord(value) && value.type === "agent_connected";
}

export function isToolCallMessage(value: unknown): value is ToolCallMessage {
	return (
		isRecord(value) &&
		value.type === "tool_call" &&
		typeof value.requestId === "string" &&
		typeof value.tool === "string" &&
		isRecord(value.args)
	);
}

export function waitForMessage<T>(
	ws: WebSocket,
	predicate: (msg: unknown) => msg is T,
	timeout = 2000,
): Promise<T> {
	return new Promise<T>((resolve, reject) => {
		const timer = setTimeout(() => {
			cleanup();
			reject(new Error("waitForMessage timeout"));
		}, timeout);

		const handler = (data: Buffer) => {
			try {
				const msg: unknown = JSON.parse(data.toString());
				if (predicate(msg)) {
					cleanup();
					resolve(msg);
				}
			} catch {
				// ignore non-JSON
			}
		};

		const cleanup = () => {
			clearTimeout(timer);
			ws.off("message", handler);
		};

		ws.on("message", handler);
	});
}

type MessageParser<T> = (message: unknown) => message is T;

export function sendMcpRequest(
	ws: WebSocket,
	method: string,
	params?: object,
	id?: string | number,
): Promise<unknown>;
export function sendMcpRequest<T>(
	ws: WebSocket,
	method: string,
	params: object | undefined,
	id: string | number | undefined,
	parser: MessageParser<T>,
): Promise<T>;
export function sendMcpRequest<T>(
	ws: WebSocket,
	method: string,
	params: object | undefined,
	id: string | number | undefined,
	parser?: MessageParser<T>,
): Promise<unknown> {
	return new Promise<unknown>((resolve, reject) => {
		const reqId = id ?? crypto.randomUUID();
		const timer = setTimeout(() => {
			cleanup();
			reject(new Error(`MCP request timeout for ${method}`));
		}, 2000);

		const handler = (data: Buffer) => {
			try {
				const msg: unknown = JSON.parse(data.toString());
				if (!isRecord(msg) || msg.id !== reqId) return;
				if ("error" in msg) {
					if (parser && !parser(msg)) {
						cleanup();
						reject(new Error("Unexpected MCP response shape"));
						return;
					}
					cleanup();
					resolve(msg);
					return;
				}
				if (parser && !parser(msg)) {
					cleanup();
					reject(new Error("Unexpected MCP response shape"));
					return;
				}
				if ("result" in msg) {
					cleanup();
					resolve(msg);
				}
			} catch {
				// ignore
			}
		};

		const cleanup = () => {
			clearTimeout(timer);
			ws.off("message", handler);
		};

		ws.on("message", handler);
		ws.send(JSON.stringify({ jsonrpc: "2.0", id: reqId, method, params }));
	});
}

export function httpRequest(
	url: string,
	options: http.RequestOptions & { body?: string } = {},
): Promise<{
	status: number;
	headers: http.IncomingHttpHeaders;
	body: string;
}> {
	return new Promise((resolve, reject) => {
		const req = http.request(url, options, (res) => {
			let body = "";
			res.on("data", (chunk) => {
				body += chunk;
			});
			res.on("end", () => {
				resolve({ status: res.statusCode ?? 0, headers: res.headers, body });
			});
		});
		req.on("error", reject);
		if (options.body) req.write(options.body);
		req.end();
	});
}
