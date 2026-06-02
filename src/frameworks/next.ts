import { ensureApertureServer } from "./shared.js";

export function withAperture<T = Record<string, unknown>>(
	nextConfig: T = {} as T,
	options?: { port?: number },
): T {
	const port = options?.port || 3456;

	// Fire-and-forget: start the server when Next.js loads the config
	ensureApertureServer(port).catch(() => {});

	const config = { ...nextConfig } as Record<string, unknown>;
	const serverExternalPackages =
		(config.serverExternalPackages as string[] | undefined) || [];
	if (!serverExternalPackages.includes("@halvo/aperture")) {
		serverExternalPackages.push("@halvo/aperture");
	}
	config.serverExternalPackages = serverExternalPackages;

	return config as T;
}
