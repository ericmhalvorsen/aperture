import { defineConfig } from "tsup";

export default defineConfig({
	entry: ["src/client.ts"],
	format: ["esm"],
	outDir: "dist-browser",
	minify: true,
	noExternal: ["lit-html"],
	define: {
		"import.meta.env.NODE_ENV": '"production"',
	},
});
