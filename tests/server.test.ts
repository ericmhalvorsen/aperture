import http from "http";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { WebSocket } from "ws";
import { ApertureServer } from "../src/server.js";

describe("ApertureServer", () => {
	let server: ApertureServer;
	const port = 4567;

	beforeAll(() => {
		server = new ApertureServer(port);
	});

	afterAll(() => {
		// Clean up the server
		(server as any).wss.close();
		if ((server as any).wss.options.server) {
			(server as any).wss.options.server.close();
		}
	});

	test("serves aperture.js over HTTP", async () => {
		return new Promise<void>((resolve, reject) => {
			http
				.get(`http://localhost:${port}/aperture.js`, (res) => {
					expect(res.statusCode).toBe(200);
					expect(res.headers["content-type"]).toContain(
						"application/javascript",
					);

					let body = "";
					res.on("data", (chunk) => {
						body += chunk;
					});
					res.on("end", () => {
						expect(body.length).toBeGreaterThan(100);
						resolve();
					});
				})
				.on("error", reject);
		});
	});

	test("allows WebSocket connections on /mcp", async () => {
		return new Promise<void>((resolve, reject) => {
			const ws = new WebSocket(`ws://localhost:${port}/mcp?type=browser`);

			ws.on("open", () => {
				expect(ws.readyState).toBe(WebSocket.OPEN);
				ws.close();
				resolve();
			});

			ws.on("error", (err) => {
				reject(err);
			});
		});
	});

	test("handles browser registration", async () => {
		return new Promise<void>((resolve, reject) => {
			const ws = new WebSocket(`ws://localhost:${port}/mcp?type=browser`);

			ws.on("open", () => {
				ws.send(
					JSON.stringify({
						type: "register",
						url: "http://example.com/test",
						title: "Test Page",
					}),
				);
			});

			ws.on("message", (data) => {
				try {
					const msg = JSON.parse(data.toString());
					if (msg.type === "registered") {
						expect(msg.sessionId).toBeDefined();
						ws.close();
						resolve();
					}
				} catch (err) {
					reject(err);
				}
			});

			ws.on("error", (err) => {
				reject(err);
			});
		});
	});
});
