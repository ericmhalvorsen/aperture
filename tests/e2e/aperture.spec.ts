import { test, expect } from "@playwright/test";
import WebSocket from "ws";

test.describe("Aperture Integration", () => {
	let ws: WebSocket;

	test.afterEach(() => {
		if (ws) {
			ws.close();
			// Small delay to ensure server processes the disconnect
			new Promise(resolve => setTimeout(resolve, 50));
		}
	});

	test("shows badge and allows approval flow", async ({ page }) => {
		await page.goto("/");

		// Badge should eventually appear and say connected
		const badge = page.locator("#aperture-badge");
		await expect(badge).toBeVisible();
		await expect(badge).toContainText("Aperture");

		// Simulate an MCP Agent connecting
		ws = new WebSocket("ws://localhost:3456/mcp");
		await new Promise(resolve => ws.on("open", resolve));

		// Send initialize request
		ws.send(JSON.stringify({
			jsonrpc: "2.0",
			id: 1,
			method: "initialize",
			params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "test-agent", version: "1.0" } }
		}));

		// Badge should eventually appear and say connected
		await expect(badge).toBeVisible();
		await expect(badge).toContainText("Aperture");

		// Wait for dialog overlay after sending agent_connected
		const overlay = page.locator("#aperture-dialog-overlay");
		await expect(overlay).toBeVisible();

		// Check dialog contents
		await expect(page.locator(".aperture-title")).toHaveText("Aperture");
		await expect(page.locator(".aperture-subtitle")).toHaveText("MCP Agent wants to access this tab");

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
		await expect(page.locator(".aperture-title")).toHaveText("Aperture Settings");
		
		// It should show Approved
		await expect(page.locator(".aperture-body")).toContainText("Approved");

		// Close status dialog
		const closeBtn = page.locator("#aperture-status-btn-close");
		await closeBtn.click();
		await expect(overlay).not.toBeVisible();
	});

	test("can deny the approval and it is remembered", async ({ page }) => {
		await page.goto("/");

		// Simulate an MCP Agent connecting
		ws = new WebSocket("ws://localhost:3456/mcp");
		await new Promise(resolve => ws.on("open", resolve));

		// Send initialize request
		ws.send(JSON.stringify({
			jsonrpc: "2.0",
			id: 1,
			method: "initialize",
			params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "test-agent", version: "1.0" } }
		}));

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

		// Click allow from the status dialog to test state change
		await page.locator("#aperture-status-btn-allow").click();
		await expect(overlay).not.toBeVisible();
		
		// Open again and it should be approved
		await badge.click();
		await expect(page.locator(".aperture-body")).toContainText("Approved");
	});

	test("can hide the badge", async ({ page }) => {
		await page.goto("/");
		
		const badge = page.locator("#aperture-badge");
		await expect(badge).toBeVisible();

		// Simulate an MCP Agent connecting
		ws = new WebSocket("ws://localhost:3456/mcp");
		await new Promise(resolve => ws.on("open", resolve));
		ws.send(JSON.stringify({
			jsonrpc: "2.0",
			id: 1,
			method: "initialize",
			params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "test-agent", version: "1.0" } }
		}));

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
