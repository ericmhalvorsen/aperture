import { createConnection } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

let serverStarting = false;
let serverStarted = false;

function getBinPath(): string {
	const __dirname = path.dirname(fileURLToPath(import.meta.url));
	return path.join(__dirname, "..", "bin.js");
}

function isPortFree(port: number): Promise<boolean> {
	return new Promise((resolve) => {
		const socket = createConnection(port, "127.0.0.1");
		socket.once("connect", () => {
			socket.destroy();
			resolve(false);
		});
		socket.once("error", () => {
			socket.destroy();
			resolve(true);
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

	const cp = await import(/* webpackIgnore: true */ "node:child_process");
	const child = cp.spawn("node", [binPath], {
		stdio: "ignore",
		env: { ...process.env, APERTURE_PORT: String(port) },
	});

	child.unref();

	process.on("exit", () => {
		try {
			child.kill();
		} catch {}
	});

	await new Promise((resolve) => setTimeout(resolve, 800));

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
