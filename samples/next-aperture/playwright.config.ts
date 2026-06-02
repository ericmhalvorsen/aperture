import { createConfig } from "../../tests/e2e/playwright.shared";

export default createConfig({
	command: "pnpm run build && pnpm run start",
	port: 3000,
});
