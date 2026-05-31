import { spawn } from "node:child_process";
import { createConnection } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

let serverStarting = false;
let serverStarted = false;

function getBinPath(): string {
	const __dirname = path.dirname(fileURLToPath(import.meta.url));
	// In built dist/, frameworks/ is next to bin.js
	return path.join(__dirname, "..", "bin.js");
}

function isPortFree(port: number): Promise<boolean> {
	return new Promise((resolve) => {
		const socket = createConnection(port, "127.0.0.1");
		socket.once("connect", () => {
			socket.destroy();
			resolve(false); // Port in use = server likely running
		});
		socket.once("error", () => {
			socket.destroy();
			resolve(true); // Port free
		});
		setTimeout(() => {
			socket.destroy();
			resolve(true);
		}, 300);
	});
}

export async function ensureApertureServer(port = 3456): Promise<void> {
	if (serverStarting || serverStarted) return;

	const free = await isPortFree(port);
	if (!free) {
		serverStarted = true;
		console.log(`[Aperture] Server already running on port ${port}`);
		return;
	}

	serverStarting = true;
	const binPath = getBinPath();

	// Spawn in same process group (detached: false) so Ctrl+C propagates.
	// stdio: "ignore" keeps logs clean; unref() lets parent exit normally.
	const child = spawn("node", [binPath], {
		stdio: "ignore",
		env: { ...process.env, APERTURE_PORT: String(port) },
	});

	child.unref();

	// Kill child when parent exits normally (prevents orphaned zombies).
	process.on("exit", () => {
		try {
			child.kill();
		} catch {
			// ignore if already dead
		}
	});

	// Wait a moment for it to bind
	await new Promise((resolve) => setTimeout(resolve, 800));

	// Verify it started
	const nowFree = await isPortFree(port);
	if (!nowFree) {
		serverStarted = true;
		serverStarting = false;
		console.log(`[Aperture] Started server on port ${port}`);
	} else {
		serverStarting = false;
		console.error(`[Aperture] Failed to start server on port ${port}`);
	}
}
