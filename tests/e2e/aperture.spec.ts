import { expect, test } from "@playwright/test";
import WebSocket from "ws";

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

test.describe("Aperture Integration", () => {
	let ws: WebSocket;
	let aperturePort: number;

	function waitForMcpResponse(id: number): Promise<unknown> {
		return new Promise((resolve, reject) => {
			const timeout = setTimeout(() => {
				ws.off("message", handleMessage);
				reject(new Error(`Timed out waiting for MCP response ${id}`));
			}, 5000);

			function handleMessage(data: WebSocket.RawData) {
				try {
					const message: unknown = JSON.parse(data.toString());
					if (
						typeof message === "object" &&
						message !== null &&
						"id" in message &&
						message.id === id
					) {
						clearTimeout(timeout);
						ws.off("message", handleMessage);
						resolve(message);
					}
				} catch {
					// Ignore non-JSON WebSocket messages.
				}
			}

			ws.on("message", handleMessage);
		});
	}

	function getLatestSessionId(response: unknown): string | null {
		if (!isRecord(response) || !isRecord(response.result)) {
			throw new Error("Unexpected browser session response");
		}
		const content = response.result.content;
		if (!Array.isArray(content) || !isRecord(content[0])) {
			throw new Error("Browser session response has no content");
		}
		const text = content[0].text;
		if (typeof text !== "string") {
			throw new Error("Browser session response has no text");
		}
		const payload: unknown = JSON.parse(text);
		if (!isRecord(payload) || !Array.isArray(payload.sessions)) {
			throw new Error("Browser session response has no sessions");
		}
		for (const session of [...payload.sessions].reverse()) {
			if (isRecord(session) && typeof session.sessionId === "string") {
				return session.sessionId;
			}
		}
		return null;
	}

	async function waitForLatestSessionId(): Promise<string> {
		for (let id = 2; id < 12; id++) {
			const sessionsResponse = waitForMcpResponse(id);
			ws.send(
				JSON.stringify({
					jsonrpc: "2.0",
					id,
					method: "tools/call",
					params: { name: "browser_list_sessions", arguments: {} },
				}),
			);
			const sessionId = getLatestSessionId(await sessionsResponse);
			if (sessionId) return sessionId;
			await new Promise((resolve) => setTimeout(resolve, 50));
		}
		throw new Error("Timed out waiting for browser session registration");
	}

	async function requestBrowserTool() {
		const initializeResponse = waitForMcpResponse(1);
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
		await initializeResponse;

		const sessionId = await waitForLatestSessionId();

		const toolResponse = waitForMcpResponse(12);
		ws.send(
			JSON.stringify({
				jsonrpc: "2.0",
				id: 12,
				method: "tools/call",
				params: {
					name: "browser_page_info",
					arguments: { sessionId },
				},
			}),
		);
		void toolResponse.catch(() => {});
	}

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

		await requestBrowserTool();

		// Badge should remain visible
		await expect(badge).toBeVisible();
		await expect(badge.locator(".dot")).toHaveClass(/pending/);

		// Approval is requested by the first tool call, not MCP initialization.
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
		await expect(badge.locator(".dot")).toHaveClass(/approved/);

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

	test("moves the badge away from the bottom-right collision area", async ({
		page,
	}, testInfo) => {
		test.skip(
			testInfo.project.name !== "vite-aperture",
			"The Vite sample exercises the configurable React integration.",
		);

		await page.goto("/");
		const badge = page.locator("#aperture-badge");
		await expect(badge).toBeVisible();

		const box = await badge.boundingBox();
		const viewport = page.viewportSize();
		expect(box).not.toBeNull();
		expect(viewport).not.toBeNull();
		if (!box || !viewport) return;

		expect(box.x).toBeCloseTo(12, 0);
		expect(box.y).toBeCloseTo(12, 0);
		expect(box.x + box.width).toBeLessThan(viewport.width / 2);
		expect(box.y + box.height).toBeLessThan(viewport.height / 2);
	});

	test("can deny the approval and it is remembered", async ({ page }) => {
		page.on("console", (msg) =>
			console.log(`[Browser Console] ${msg.type()}: ${msg.text()}`),
		);
		await page.goto("/");

		// Simulate an MCP Agent connecting
		ws = new WebSocket(`ws://localhost:${aperturePort}/mcp`);
		await new Promise((resolve) => ws.on("open", resolve));

		await requestBrowserTool();

		const overlay = page.locator("#aperture-dialog-overlay");
		await expect(overlay).toBeVisible();
		const badge = page.locator("#aperture-badge");

		// Click Deny
		const denyBtn = page.locator("#aperture-btn-deny");
		await denyBtn.click();
		await expect(badge.locator(".dot")).toHaveClass(/denied/);
		await expect(overlay).not.toBeVisible();

		// Open status dialog
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
		await requestBrowserTool();

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
