import http from "node:http";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { ApertureServer } from "../../src/server.js";
import { httpRequest, readSSE } from "./helpers.js";

describe("ApertureServer SSE", () => {
	let server: ApertureServer;
	const port = 4575;

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

	test("SSE endpoint returns endpoint event", async () => {
		const res = await readSSE(`http://localhost:${port}/sse`, (body) =>
			body.includes("event: endpoint"),
		);
		expect(res.status).toBe(200);
		expect(res.headers["content-type"]).toContain("text/event-stream");
		expect(res.body).toContain("event: endpoint");
		expect(res.body).toMatch(/\/messages\/[a-zA-Z0-9-]+[?]sessionId=/);
	});

	test("SSE message endpoint accepts JSON-RPC and responds via stream", async () => {
		// 1. Open a persistent SSE connection and extract the endpoint URL
		let messageUrl = "";
		const ssePromise = new Promise<string>((resolve) => {
			http.get(`http://localhost:${port}/sse`, (res) => {
				let buffer = "";
				res.on("data", (chunk) => {
					buffer += chunk;
					if (!messageUrl) {
						const match = buffer.match(/event: endpoint\ndata: (.+)\n/);
						if (match) messageUrl = match[1].trim();
					}
					if (buffer.includes("event: message")) {
						resolve(buffer);

						res.destroy();
					}
				});
			});
		});

		// Wait until endpoint URL is received
		await new Promise<void>((resolve) => {
			const check = () => {
				if (messageUrl) resolve();
				else setTimeout(check, 10);
			};
			check();
		});

		// 2. POST initialize via the message endpoint
		const postUrl = messageUrl.startsWith("http")
			? messageUrl
			: `http://localhost:${port}${messageUrl}`;
		const postRes = await httpRequest(postUrl, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				jsonrpc: "2.0",
				id: "sse-init-1",
				method: "initialize",
				params: {
					protocolVersion: "2024-11-05",
					capabilities: {},
					clientInfo: { name: "sse-test", version: "1.0" },
				},
			}),
		});

		expect(postRes.status).toBe(202);

		const sseBody = await ssePromise;
		expect(sseBody).toContain("event: message");
		expect(sseBody).toContain("sse-init-1");
		expect(sseBody).toContain("aperture");
	});

	test("SSE message endpoint accepts JSON-RPC via Mcp-Session-Id header", async () => {
		let sessionId = "";
		const ssePromise = new Promise<string>((resolve) => {
			http.get(`http://localhost:${port}/sse`, (res) => {
				sessionId = res.headers["mcp-session-id"] as string;
				let buffer = "";
				res.on("data", (chunk) => {
					buffer += chunk;
					if (buffer.includes("event: message")) {
						resolve(buffer);

						res.destroy();
					}
				});
			});
		});

		// Wait until sessionId header is received
		await new Promise<void>((resolve) => {
			const check = () => {
				if (sessionId) resolve();
				else setTimeout(check, 10);
			};
			check();
		});

		// POST initialize via the message endpoint, using the header instead of query param
		const postRes = await httpRequest(`http://localhost:${port}/messages`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"Mcp-Session-Id": sessionId,
			},
			body: JSON.stringify({
				jsonrpc: "2.0",
				id: "sse-init-hdr-1",
				method: "initialize",
				params: {
					protocolVersion: "2024-11-05",
					capabilities: {},
					clientInfo: { name: "sse-test-hdr", version: "1.0" },
				},
			}),
		});

		expect(postRes.status).toBe(202);
		expect(postRes.headers["mcp-session-id"]).toBe(sessionId);

		const sseBody = await ssePromise;
		expect(sseBody).toContain("event: message");
		expect(sseBody).toContain("sse-init-hdr-1");
		expect(sseBody).toContain("aperture");
	});

	test("SSE returns 404 for unknown session", async () => {
		const res = await httpRequest(
			`http://localhost:${port}/messages?sessionId=unknown-session`,
			{
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
			},
		);
		expect(res.status).toBe(404);
	});
});
