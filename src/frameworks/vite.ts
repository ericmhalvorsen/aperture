import { ensureApertureServer } from "./shared.js";

export function aperture(options?: { port?: number }): {
	name: string;
	apply: string;
	config: () => { define: Record<string, string> };
	configureServer: () => Promise<void>;
} {
	const port = options?.port || Number(process.env.APERTURE_PORT) || 3456;
	let started = false;

	return {
		name: "aperture",
		apply: "serve",
		config() {
			return {
				define: {
					"window.__APERTURE_PORT__": JSON.stringify(port),
				},
			};
		},
		async configureServer() {
			if (started) return;
			started = true;
			await ensureApertureServer(port);
		},
	};
}
