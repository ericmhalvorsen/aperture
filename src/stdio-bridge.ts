#!/usr/bin/env node
/**
 * Stdio bridge for MCP clients (opencode, Claude Code, etc.)
 * Connects to an already-running Aperture server via WebSocket.
 * Usage: node stdio-bridge.js [PORT]
 */

import { WebSocket } from "ws";

const port = Number(process.argv[2]) || 3456;
const url = `ws://localhost:${port}/mcp`;

let ws: WebSocket | null = null;
let connected = false;
const pending: string[] = [];
let initSent = false;

function flush() {
	if (!ws || !connected) return;
	while (pending.length > 0) {
		const line = pending.shift();
		if (line) ws.send(line);
	}
}

function connect() {
	ws = new WebSocket(url);

	ws.on("open", () => {
		connected = true;
		console.error("[Aperture Bridge] Connected.");
		if (!initSent) {
			initSent = true;
			if (!ws) return;
			ws.send(
				JSON.stringify({
					jsonrpc: "2.0",
					id: 0,
					method: "initialize",
					params: {
						protocolVersion: "2024-11-05",
						capabilities: {},
						clientInfo: { name: "stdio-bridge", version: "0.1.0" },
					},
				}),
			);
		}
		flush();
	});

	ws.on("message", (data) => {
		process.stdout.write(`${data.toString()}\n`);
	});

	ws.on("close", () => {
		connected = false;
		console.error("[Aperture Bridge] Disconnected, retrying...");
		setTimeout(connect, 2000);
	});

	ws.on("error", (err) => {
		console.error("[Aperture Bridge] Connection error:", err.message);
	});
}

process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
	const lines = chunk
		.toString()
		.split("\n")
		.filter((l) => l.trim());
	for (const line of lines) {
		if (ws && connected) {
			ws.send(line);
		} else {
			pending.push(line);
		}
	}
});

process.stdin.on("end", () => {
	console.error("[Aperture Bridge] Stdin closed, keeping connection alive.");
});

connect();
console.error(`[Aperture Bridge] Connecting to ${url}...`);
