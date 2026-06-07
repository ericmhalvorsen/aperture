#!/usr/bin/env node
import { spawn } from "node:child_process";
import { parseArgs } from "node:util";
import pc from "picocolors";
import { ApertureServer } from "./server.js";

const { values, positionals } = parseArgs({
	options: {
		port: { type: "string", short: "p" },
		verbose: { type: "boolean", short: "v" },
		help: { type: "boolean", short: "h" },
	},
	allowPositionals: true,
	strict: false,
});

if (values.help) {
	console.log(`
  ${pc.cyan(pc.bold("Aperture MCP Server"))}
  
  ${pc.bold("Usage:")}
    $ aperture [options] [command...]
    
  ${pc.bold("Options:")}
    -p, --port <port>    Port to run the MCP server on (default: 3456)
    -v, --verbose        Enable verbose logging of MCP traffic
    -h, --help           Show this help message
    
  ${pc.bold("Examples:")}
    $ aperture                           # Run standalone MCP server
    $ aperture stdin                     # Run standalone MCP server via stdin/stdout
    $ aperture -p 4000                   # Run on port 4000
    $ aperture next dev                  # Run MCP server and spawn "next dev"
`);
	process.exit(0);
}

const port = Number(values.port || process.env.APERTURE_PORT) || 3456;
const verbose = Boolean(values.verbose);

const isStdioMode = positionals[0] === "stdin";

if (isStdioMode) {
	new ApertureServer(port, { verbose, silentStartup: true, stdio: true });
	console.error(pc.cyan(`\n● Aperture MCP Server initialized (stdio mode)`));
	console.error(
		`${pc.dim("├")} MCP Endpoint:   ${pc.green(`ws://localhost:${port}/mcp`)}`,
	);
	console.error(
		`${pc.dim("└")} Browser Script: ${pc.blue(`http://localhost:${port}/aperture.js`)}\n`,
	);
} else {
	new ApertureServer(port, { verbose, silentStartup: true });
	console.log(pc.cyan(`\n● Aperture MCP Server initialized`));
	console.log(
		`${pc.dim("├")} MCP Endpoint:   ${pc.green(`ws://localhost:${port}/mcp`)}`,
	);
	console.log(
		`${pc.dim("└")} Browser Script: ${pc.blue(`http://localhost:${port}/aperture.js`)}\n`,
	);

	if (positionals.length > 0) {
		const [command, ...args] = positionals;
		console.log(
			pc.dim(`> Spawning wrapped command: ${command} ${args.join(" ")}\n`),
		);

		const child = spawn(command, args, {
			stdio: "inherit",
			shell: true,
			env: { ...process.env, APERTURE_PORT: port.toString() },
		});

		child.on("exit", (code) => {
			process.exit(code ?? 0);
		});
	} else {
		console.log(pc.dim("Waiting for connections... (Press Ctrl+C to stop)"));
	}
}
