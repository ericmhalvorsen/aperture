import { defineConfig, devices, PlaywrightTestConfig } from "@playwright/test";

export const sharedPlaywrightConfig: PlaywrightTestConfig = {
	testDir: "../../tests/e2e",
	fullyParallel: false,
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 2 : 0,
	workers: process.env.CI ? 1 : undefined,
	reporter: "html",
	use: {
		trace: "on-first-retry",
		baseURL: "http://localhost", // Overridden per project
	},
	projects: [
		{
			name: "chromium",
			use: { ...devices["Desktop Chrome"] },
		},
	],
};

// You can use this to merge config with a specific webServer
export function createConfig(webServer: { command: string; port: number }) {
	return defineConfig({
		...sharedPlaywrightConfig,
		use: {
			...sharedPlaywrightConfig.use,
			baseURL: `http://localhost:${webServer.port}`,
		},
		webServer: {
			...webServer,
			reuseExistingServer: !process.env.CI,
		},
	});
}
