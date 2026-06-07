import { ensureApertureServer } from "./shared.js";

export function withAperture<T = Record<string, unknown>>(
	nextConfig: T = {} as T,
	options?: { port?: number },
): T {
	const port = options?.port || 3456;

	ensureApertureServer(port).catch(console.error);

	const config = { ...nextConfig } as Record<string, unknown>;
	const serverExternalPackages =
		(config.serverExternalPackages as string[] | undefined) || [];
	if (!serverExternalPackages.includes("@ericmhalvorsen/aperture")) {
		serverExternalPackages.push("@ericmhalvorsen/aperture");
	}
	config.serverExternalPackages = serverExternalPackages;

	return config as T;
}
