import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
	testDir: "./tests/e2e",
	fullyParallel: true,
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 2 : 0,
	workers: process.env.CI ? 1 : undefined,
	reporter: "html",
	use: {
		trace: "on-first-retry",
		...devices["Desktop Chrome"],
	},
	projects: [
		{
			name: "next-aperture",
			use: { baseURL: "http://localhost:3000" },
		},
		{
			name: "vanilla-aperture",
			use: { baseURL: "http://localhost:5173" },
		},
		{
			name: "vite-aperture",
			use: { baseURL: "http://localhost:5174" },
		},
	],
	webServer: [
		{
			command:
				"pnpm --filter next-aperture run build && pnpm --filter next-aperture run start",
			port: 3000,
			env: { APERTURE_PORT: "3456" },
			reuseExistingServer: !process.env.CI,
		},
		{
			command: "pnpm --filter vanilla-aperture run dev",
			port: 5173,
			env: { APERTURE_PORT: "3457" },
			reuseExistingServer: !process.env.CI,
		},
		{
			command: "pnpm --filter vite-aperture run dev",
			port: 5174,
			env: { APERTURE_PORT: "3458" },
			reuseExistingServer: !process.env.CI,
		},
	],
});
