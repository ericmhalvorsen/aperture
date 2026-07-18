import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { ApertureServer } from "../../src/server.js";
import { httpRequest } from "./helpers.js";

describe("ApertureServer Streamable HTTP", () => {
	let server: ApertureServer;
	const port = 4575;

	beforeAll(() => {
		server = new ApertureServer(port, { silentStartup: true });
	});

	afterAll(() => server.close());

	test("Streamable HTTP endpoint accepts initialize request", async () => {
		const res = await httpRequest(`http://localhost:${port}/mcp`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Accept: "application/json, text/event-stream",
			},
			body: JSON.stringify({
				jsonrpc: "2.0",
				id: "init-1",
				method: "initialize",
				params: {
					protocolVersion: "2025-03-26",
					capabilities: {},
					clientInfo: { name: "streamable-test", version: "1.0" },
				},
			}),
		});

		expect(res.status).toBe(200);
		expect(res.headers["mcp-session-id"]).toBeDefined();
		expect(res.body).toContain("init-1");
		expect(res.body).toContain("aperture");
	});

	test("Streamable HTTP requires session ID for subsequent requests", async () => {
		// First, initialize to get a session ID
		const initRes = await httpRequest(`http://localhost:${port}/mcp`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Accept: "application/json, text/event-stream",
			},
			body: JSON.stringify({
				jsonrpc: "2.0",
				id: "init-2",
				method: "initialize",
				params: {
					protocolVersion: "2025-03-26",
					capabilities: {},
					clientInfo: { name: "streamable-test-2", version: "1.0" },
				},
			}),
		});

		const sessionId = initRes.headers["mcp-session-id"];
		expect(sessionId).toBeDefined();

		// Now make a request with the session ID
		const toolsRes = await httpRequest(`http://localhost:${port}/mcp`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Accept: "application/json, text/event-stream",
				"Mcp-Session-Id": sessionId,
			},
			body: JSON.stringify({
				jsonrpc: "2.0",
				id: "tools-1",
				method: "tools/list",
			}),
		});

		expect(toolsRes.status).toBe(200);
		expect(toolsRes.body).toContain("tools-1");
		expect(toolsRes.body).toContain("browser_");
	});

	test("Streamable HTTP GET endpoint requires valid session", async () => {
		const res = await httpRequest(`http://localhost:${port}/mcp`, {
			method: "GET",
			headers: {
				Accept: "text/event-stream",
			},
		});

		expect(res.status).toBe(400);
		expect(res.body).toContain("Invalid or missing session ID");
	});

	test("Streamable HTTP DELETE endpoint terminates session", async () => {
		// Initialize to get a session ID
		const initRes = await httpRequest(`http://localhost:${port}/mcp`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Accept: "application/json, text/event-stream",
			},
			body: JSON.stringify({
				jsonrpc: "2.0",
				id: "init-3",
				method: "initialize",
				params: {
					protocolVersion: "2025-03-26",
					capabilities: {},
					clientInfo: { name: "streamable-test-3", version: "1.0" },
				},
			}),
		});

		const sessionId = initRes.headers["mcp-session-id"];
		expect(sessionId).toBeDefined();

		// Delete the session
		const deleteRes = await httpRequest(`http://localhost:${port}/mcp`, {
			method: "DELETE",
			headers: {
				"Mcp-Session-Id": sessionId,
			},
		});

		expect(deleteRes.status).toBe(200);

		// Try to use the deleted session - should get 404
		const toolsRes = await httpRequest(`http://localhost:${port}/mcp`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Accept: "application/json, text/event-stream",
				"Mcp-Session-Id": sessionId,
			},
			body: JSON.stringify({
				jsonrpc: "2.0",
				id: "tools-2",
				method: "tools/list",
			}),
		});

		// Should return 400 or 404 for deleted session
		expect([400, 404]).toContain(toolsRes.status);
	});
});
