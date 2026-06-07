import http from "node:http";
import type { WebSocket } from "ws";

export function waitForMessage<T = unknown>(
	ws: WebSocket,
	predicate?: (msg: T) => boolean,
	timeout = 2000,
): Promise<T> {
	return new Promise<T>((resolve, reject) => {
		const timer = setTimeout(() => {
			cleanup();
			reject(new Error("waitForMessage timeout"));
		}, timeout);

		const handler = (data: Buffer) => {
			try {
				const msg = JSON.parse(data.toString()) as T;
				if (!predicate || predicate(msg)) {
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

export function sendMcpRequest<T>(
	ws: WebSocket,
	method: string,
	params?: object,
	id?: string | number,
): Promise<T> {
	return new Promise<T>((resolve, reject) => {
		const reqId = id ?? crypto.randomUUID();
		const timer = setTimeout(() => {
			cleanup();
			reject(new Error(`MCP request timeout for ${method}`));
		}, 2000);

		const handler = (data: Buffer) => {
			try {
				const msg = JSON.parse(data.toString()) as T & {
					id?: string | number;
				};
				if (msg.id === reqId) {
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

/** Open an SSE stream, read until `predicate` passes, then destroy the response. */
export function readSSE(
	url: string,
	predicate: (chunk: string) => boolean,
	timeout = 3000,
): Promise<{
	status: number;
	headers: http.IncomingHttpHeaders;
	body: string;
}> {
	return new Promise((resolve, reject) => {
		const timer = setTimeout(() => {
			res?.destroy();
			reject(new Error("readSSE timeout"));
		}, timeout);

		let body = "";
		let res: http.IncomingMessage | null = null;

		const req = http.get(url, (response) => {
			res = response;
			response.on("data", (chunk: Buffer) => {
				body += chunk.toString();
				if (predicate(body)) {
					clearTimeout(timer);
					response.destroy();
					resolve({
						status: response.statusCode ?? 0,
						headers: response.headers,
						body,
					});
				}
			});
			response.on("error", (err) => {
				clearTimeout(timer);
				reject(err);
			});
		});

		req.on("error", (err) => {
			clearTimeout(timer);
			reject(err);
		});
	});
}
