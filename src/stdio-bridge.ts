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

function connect() {
	ws = new WebSocket(url);

	ws.on("open", () => {
		connected = true;
		// Send initialize
		ws!.send(
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
	});

	ws.on("message", (data) => {
		process.stdout.write(data.toString() + "\n");
	});

	ws.on("close", () => {
		connected = false;
		// Retry in 2s
		setTimeout(connect, 2000);
	});

	ws.on("error", (err) => {
		console.error("[Aperture Bridge] Connection error:", err.message);
	});
}

// Read JSON-RPC from stdin and forward to WebSocket
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
			// Buffer or error if not connected
			process.stdout.write(
				JSON.stringify({
					jsonrpc: "2.0",
					id: null,
					error: { code: -32000, message: "Not connected to Aperture server" },
				}) + "\n",
			);
		}
	}
});

process.stdin.on("end", () => {
	if (ws) ws.close();
	process.exit(0);
});

connect();
console.error(`[Aperture Bridge] Connecting to ${url}...`);
