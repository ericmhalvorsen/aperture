import { expect, test } from "@playwright/test";
import WebSocket from "ws";

test.describe("Aperture Integration", () => {
	let ws: WebSocket;
	let aperturePort: number;

	test.beforeEach(({ page: _page }, testInfo) => {
		if (testInfo.project.name === "next-aperture") aperturePort = 3456;
		else if (testInfo.project.name === "vanilla-aperture") aperturePort = 3457;
		else if (testInfo.project.name === "vite-aperture") aperturePort = 3458;
		else aperturePort = 3456; // fallback for standalone runs
	});

	test.afterEach(async () => {
		if (ws) {
			ws.close();
			// Small delay to ensure server processes the disconnect
			await new Promise((resolve) => setTimeout(resolve, 50));
		}
	});

	test("shows badge and allows approval flow", async ({ page }) => {
		page.on("console", (msg) =>
			console.log(`[Browser Console] ${msg.type()}: ${msg.text()}`),
		);
		page.on("pageerror", (err) =>
			console.error(`[Browser Error]: ${err.message}`),
		);
		page.on("response", (res) =>
			console.log(`[Network] ${res.status()} ${res.url()}`),
		);
		await page.goto("/");

		// Badge should eventually appear
		const badge = page.locator("#aperture-badge");
		await expect(badge).toBeVisible();

		// Simulate an MCP Agent connecting
		ws = new WebSocket(`ws://localhost:${aperturePort}/mcp`);
		await new Promise((resolve) => ws.on("open", resolve));

		// Send initialize request
		ws.send(
			JSON.stringify({
				jsonrpc: "2.0",
				id: 1,
				method: "initialize",
				params: {
					protocolVersion: "2024-11-05",
					capabilities: {},
					clientInfo: { name: "test-agent", version: "1.0" },
				},
			}),
		);

		// Badge should remain visible
		await expect(badge).toBeVisible();

		// Wait for dialog overlay after sending agent_connected
		const overlay = page.locator("#aperture-dialog-overlay");
		await expect(overlay).toBeVisible();

		// Check dialog contents
		await expect(page.locator(".aperture-title")).toHaveText("Agent Bridge");
		await expect(page.locator(".aperture-subtitle")).toHaveText(
			"MCP Agent wants to access this tab",
		);

		// Wait for the "Allow" button and click it
		const allowBtn = page.locator("#aperture-btn-allow");
		await expect(allowBtn).toBeVisible();

		// Remove screenshot checkbox to prevent browser permission prompts in headless test
		const screenshotCheckbox = page.locator("#aperture-allow-screenshot");
		await screenshotCheckbox.uncheck();

		await allowBtn.click();

		// Overlay should disappear
		await expect(overlay).not.toBeVisible();

		// You can open status dialog by clicking the badge
		await badge.click();

		// Status dialog should appear
		await expect(overlay).toBeVisible();
		await expect(page.locator(".aperture-title")).toHaveText("Agent Bridge");

		// It should show Approved
		await expect(page.locator(".aperture-body")).toContainText("Approved");

		// Close status dialog
		const closeBtn = page.locator("#aperture-status-btn-close");
		await closeBtn.click();
		await expect(overlay).not.toBeVisible();
	});

	test("can deny the approval and it is remembered", async ({ page }) => {
		page.on("console", (msg) =>
			console.log(`[Browser Console] ${msg.type()}: ${msg.text()}`),
		);
		await page.goto("/");

		// Simulate an MCP Agent connecting
		ws = new WebSocket(`ws://localhost:${aperturePort}/mcp`);
		await new Promise((resolve) => ws.on("open", resolve));

		// Send initialize request
		ws.send(
			JSON.stringify({
				jsonrpc: "2.0",
				id: 1,
				method: "initialize",
				params: {
					protocolVersion: "2024-11-05",
					capabilities: {},
					clientInfo: { name: "test-agent", version: "1.0" },
				},
			}),
		);

		const overlay = page.locator("#aperture-dialog-overlay");
		await expect(overlay).toBeVisible();

		// Click Deny
		const denyBtn = page.locator("#aperture-btn-deny");
		await denyBtn.click();
		await expect(overlay).not.toBeVisible();

		// Open status dialog
		const badge = page.locator("#aperture-badge");
		await badge.click();

		await expect(overlay).toBeVisible();
		await expect(page.locator(".aperture-body")).toContainText("Denied");

		// Close via Escape (status dialog has no close button when denied)
		await page.keyboard.press("Escape");
		await expect(overlay).not.toBeVisible();

		// Reopen: denial should persist
		await badge.click();
		await expect(overlay).toBeVisible();
		await expect(page.locator(".aperture-body")).toContainText("Denied");
	});

	test("can hide the badge", async ({ page }) => {
		await page.goto("/");

		const badge = page.locator("#aperture-badge");
		await expect(badge).toBeVisible();

		// Simulate an MCP Agent connecting
		ws = new WebSocket(`ws://localhost:${aperturePort}/mcp`);
		await new Promise((resolve) => ws.on("open", resolve));
		ws.send(
			JSON.stringify({
				jsonrpc: "2.0",
				id: 1,
				method: "initialize",
				params: {
					protocolVersion: "2024-11-05",
					capabilities: {},
					clientInfo: { name: "test-agent", version: "1.0" },
				},
			}),
		);

		const overlay = page.locator("#aperture-dialog-overlay");
		await expect(overlay).toBeVisible();

		// Deny it first to dismiss the popup
		await page.getByRole("button", { name: "Deny" }).click();
		await expect(overlay).not.toBeVisible();

		await expect(badge).toBeVisible();
		await badge.click();

		// We can reuse the existing overlay locator
		await expect(overlay).toBeVisible();

		const hideBtn = page.locator("#aperture-status-btn-hide");
		await expect(hideBtn).toHaveText("Hide badge for 24 hours");
		await hideBtn.click();

		await expect(overlay).not.toBeVisible();
		await expect(badge).not.toBeVisible();
	});
});
