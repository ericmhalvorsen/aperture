import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		globals: true,
		exclude: [
			"**/node_modules/**",
			"**/dist/**",
			"**/samples/**",
			"tests/e2e/**",
		],
		coverage: {
			exclude: [
				"**/node_modules/**",
				"**/dist/**",
				"**/samples/**",
				"**/tests/**",
			],
			thresholds: {
				lines: 50,
				functions: 50,
				branches: 40,
				statements: 50,
			},
		},
	},
});
