// @vitest-environment jsdom
import { beforeEach, describe, expect, test, vi } from "vitest";
import {
	injectStyles,
	showApprovalDialog,
	showStatusDialog,
} from "../src/client/ui.js";

describe("UI Module", () => {
	beforeEach(() => {
		document.head.innerHTML = "";
		document.body.innerHTML = "";
	});

	test("injectStyles adds stylesheet", () => {
		injectStyles();
		expect(document.getElementById("aperture-styles")).not.toBeNull();
		// Calling again shouldn't duplicate
		injectStyles();
		const styles = document.querySelectorAll("#aperture-styles");
		expect(styles).toHaveLength(1);
	});

	test("showApprovalDialog renders and handles denial", async () => {
		const onStateChange = vi.fn();
		const promise = showApprovalDialog("TestAgent", onStateChange);

		const overlay = document.getElementById("aperture-dialog-overlay");
		expect(overlay).not.toBeNull();
		expect(document.body.innerHTML).toContain(
			"TestAgent wants to access this tab",
		);

		// Simulate deny
		const denyBtn = overlay?.querySelector(
			"#aperture-btn-deny",
		) as HTMLButtonElement;
		expect(denyBtn).not.toBeNull();
		denyBtn.click();

		const result = await promise;
		expect(result.approved).toBe(false);
	});

	test("showApprovalDialog handles allow", async () => {
		const onStateChange = vi.fn();
		const promise = showApprovalDialog("TestAgent", onStateChange);

		const overlay = document.getElementById("aperture-dialog-overlay");

		// Turn off screenshot to avoid getUserMedia in test
		const screenshotBox = overlay?.querySelector(
			"#aperture-allow-screenshot",
		) as HTMLInputElement;
		screenshotBox.checked = false;
		screenshotBox.dispatchEvent(new Event("change"));

		const evalBox = overlay?.querySelector(
			"#aperture-allow-eval",
		) as HTMLInputElement;
		evalBox.checked = true;
		evalBox.dispatchEvent(new Event("change"));

		const allowBtn = overlay?.querySelector(
			"#aperture-btn-allow",
		) as HTMLButtonElement;
		allowBtn.click();

		const result = await promise;
		expect(result.approved).toBe(true);
		expect(result.capabilities).toContain("evaluate");
		expect(result.capabilities).not.toContain("screenshot");
	});

	test("showApprovalDialog handles escape key", async () => {
		const onStateChange = vi.fn();
		const promise = showApprovalDialog("TestAgent", onStateChange);

		// Press escape
		document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));

		const result = await promise;
		expect(result.approved).toBe(false);
		expect(result.dismissed).toBe(true);
	});

	test("showStatusDialog renders connected status", () => {
		showStatusDialog({
			wsReadyState: 1, // OPEN
			approved: true,
			denied: false,
			capabilities: ["console", "evaluate"],
			isBadgeHidden: () => false,
			showBadge: vi.fn(),
			hideBadgeFor24h: vi.fn(),
			revokeApproval: vi.fn(),
			onApprovalStateChange: vi.fn(),
		});

		const overlay = document.getElementById("aperture-dialog-overlay");
		expect(overlay).not.toBeNull();
		expect(overlay?.innerHTML).toContain("Connected");
		expect(overlay?.innerHTML).toContain("Approved");

		// Click close
		const closeBtn = overlay?.querySelector(
			"#aperture-status-btn-close",
		) as HTMLButtonElement;
		closeBtn.click();
	});

	test("showStatusDialog handles revoke", () => {
		const revokeFn = vi.fn();
		const changeFn = vi.fn();

		showStatusDialog({
			wsReadyState: 3, // CLOSED
			approved: true,
			denied: false,
			capabilities: [],
			isBadgeHidden: () => false,
			showBadge: vi.fn(),
			hideBadgeFor24h: vi.fn(),
			revokeApproval: revokeFn,
			onApprovalStateChange: changeFn,
		});

		const overlay = document.getElementById("aperture-dialog-overlay");
		const revokeBtn = overlay?.querySelector(
			"#aperture-status-btn-revoke",
		) as HTMLButtonElement;
		revokeBtn.click();

		expect(revokeFn).toHaveBeenCalled();
		expect(changeFn).toHaveBeenCalledWith({
			approved: false,
			capabilities: [],
			stream: null,
		});
	});
});
