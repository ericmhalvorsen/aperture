import { createConfig } from "../../tests/e2e/playwright.shared";

export default createConfig({
	command: "pnpm run dev",
	port: 5173,
});
