import { spawn } from "node:child_process";
import { describe, expect, test } from "vitest";

describe("CLI wrapper", () => {
	test("displays help message with -h", async () => {
		const child = spawn("node", ["dist/bin.js", "-h"]);
		let output = "";

		child.stdout.on("data", (chunk) => {
			output += chunk.toString();
		});

		const code = await new Promise((resolve) => child.on("exit", resolve));

		expect(code).toBe(0);
		expect(output).toContain("Aperture MCP Server");
		expect(output).toContain("Usage:");
		expect(output).toContain("Options:");
	});

	test("starts server and spawns wrapped command", async () => {
		const child = spawn("node", [
			"dist/bin.js",
			"-p",
			"5002",
			"echo",
			"aperture-cli-test",
		]);
		let output = "";
		let errOutput = "";

		child.stdout.on("data", (chunk) => {
			output += chunk.toString();
		});

		child.stderr.on("data", (chunk) => {
			errOutput += chunk.toString();
		});

		const code = await new Promise((resolve) => child.on("exit", resolve));

		expect(code).toBe(0);
		expect(output).toContain("Aperture MCP Server initialized");
		expect(output).toContain("ws://localhost:5002/mcp");
		expect(output).toContain("aperture-cli-test");
		expect(errOutput).toBe(""); // should be empty
	});

	test("starts server in stdio mode when stdin is supplied and port is free", async () => {
		const child = spawn("node", ["dist/bin.js", "stdin", "-p", "5003"]);
		let stdout = "";
		let stderr = "";

		child.stdout.on("data", (chunk) => {
			stdout += chunk.toString();
		});

		child.stderr.on("data", (chunk) => {
			stderr += chunk.toString();
		});

		// Wait a moment for server to bind
		await new Promise((resolve) => setTimeout(resolve, 1000));

		// Check that stdout does NOT contain human-readable init text (since that would pollute stdio)
		expect(stdout).not.toContain("Aperture MCP Server initialized");
		// Check that stderr contains the initialization logs
		expect(stderr).toContain("Aperture MCP Server initialized (stdio mode)");
		expect(stderr).toContain("ws://localhost:5003/mcp");

		// Clean up
		child.kill("SIGINT");
	});
});
