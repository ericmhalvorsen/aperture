import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { ApertureServer } from "../../src/server.js";
import { httpRequest } from "./helpers.js";

describe("ApertureServer HTTP", () => {
	let server: ApertureServer;
	const port = 4570;

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

	test("serves aperture.js over HTTP", async () => {
		const res = await httpRequest(`http://localhost:${port}/aperture.js`);
		expect(res.status).toBe(200);
		expect(res.headers["content-type"]).toContain("application/javascript");
		expect(res.body.length).toBeGreaterThan(100);
	});

	test("returns 404 for unknown paths", async () => {
		const res = await httpRequest(`http://localhost:${port}/unknown`);
		expect(res.status).toBe(404);
	});

	test("handles CORS preflight", async () => {
		const res = await httpRequest(`http://localhost:${port}/mcp`, {
			method: "OPTIONS",
		});
		expect(res.status).toBe(204);
		expect(res.headers["access-control-allow-origin"]).toBe("*");
	});

	test("HTTP POST to /mcp handles JSON-RPC initialize", async () => {
		const res = await httpRequest(`http://localhost:${port}/mcp`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				jsonrpc: "2.0",
				id: "http-1",
				method: "initialize",
				params: {
					protocolVersion: "2024-11-05",
					capabilities: {},
					clientInfo: { name: "http-test", version: "1.0" },
				},
			}),
		});

		expect(res.status).toBe(200);
		const parsed = JSON.parse(res.body);
		expect(parsed.id).toBe("http-1");
		expect(parsed.result.serverInfo.name).toBe("aperture");
	});
});
