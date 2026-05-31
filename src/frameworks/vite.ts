import { ensureApertureServer } from "./shared.js";

export function aperture(options?: { port?: number }): {
	name: string;
	apply: string;
	configureServer: () => Promise<void>;
} {
	const port = options?.port || 3456;
	let started = false;

	return {
		name: "aperture",
		apply: "serve", // Only in dev mode
		async configureServer() {
			if (started) return;
			started = true;
			await ensureApertureServer(port);
		},
	};
}
