// @vitest-environment jsdom
import { beforeEach, describe, expect, test, vi } from "vitest";
import {
	injectStyles,
	requestDisplayMedia,
	showApprovalDialog,
	showScreenshotPermissionDialog,
	showStatusDialog,
} from "../src/client/ui.js";

function getElement<T extends Element>(
	root: ParentNode | null | undefined,
	selector: string,
	guard: (element: Element) => element is T,
): T {
	const element = root?.querySelector(selector);
	if (!element || !guard(element)) {
		throw new Error(`Expected ${selector} to match the expected element`);
	}
	return element;
}

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
		const promise = showApprovalDialog("TestAgent");

		const overlay = document.getElementById("aperture-dialog-overlay");
		expect(overlay).not.toBeNull();
		expect(document.body.innerHTML).toContain(
			"TestAgent wants to access this tab",
		);

		// Simulate deny
		const denyBtn = getElement(
			overlay,
			"#aperture-btn-deny",
			(element): element is HTMLButtonElement =>
				element instanceof HTMLButtonElement,
		);
		expect(denyBtn).not.toBeNull();
		denyBtn.click();

		const result = await promise;
		expect(result.approved).toBe(false);
	});

	test("showApprovalDialog handles allow", async () => {
		const promise = showApprovalDialog("TestAgent");

		const overlay = document.getElementById("aperture-dialog-overlay");

		// Turn off screenshot to avoid getUserMedia in test
		const screenshotBox = getElement(
			overlay,
			"#aperture-allow-screenshot",
			(element): element is HTMLInputElement =>
				element instanceof HTMLInputElement,
		);
		screenshotBox.checked = false;
		screenshotBox.dispatchEvent(new Event("change"));

		const evalBox = getElement(
			overlay,
			"#aperture-allow-eval",
			(element): element is HTMLInputElement =>
				element instanceof HTMLInputElement,
		);
		evalBox.checked = true;
		evalBox.dispatchEvent(new Event("change"));

		const allowBtn = getElement(
			overlay,
			"#aperture-btn-allow",
			(element): element is HTMLButtonElement =>
				element instanceof HTMLButtonElement,
		);
		allowBtn.click();

		const result = await promise;
		expect(result.approved).toBe(true);
		expect(result.capabilities).toContain("evaluate");
		expect(result.capabilities).not.toContain("screenshot");
	});

	test("defers screenshot permission until a screenshot is requested", async () => {
		const originalMediaDevices = navigator.mediaDevices;
		const getDisplayMedia = vi.fn();
		Object.defineProperty(navigator, "mediaDevices", {
			configurable: true,
			value: { getDisplayMedia },
		});

		const promise = showApprovalDialog("TestAgent");
		const overlay = document.getElementById("aperture-dialog-overlay");
		const allowBtn = getElement(
			overlay,
			"#aperture-btn-allow",
			(element): element is HTMLButtonElement =>
				element instanceof HTMLButtonElement,
		);
		allowBtn.click();

		const result = await promise;
		expect(result.capabilities).toContain("screenshot");
		expect(getDisplayMedia).not.toHaveBeenCalled();
		Object.defineProperty(navigator, "mediaDevices", {
			configurable: true,
			value: originalMediaDevices,
		});
	});

	test("showApprovalDialog handles escape key", async () => {
		const promise = showApprovalDialog("TestAgent");

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
		const closeBtn = getElement(
			overlay,
			"#aperture-status-btn-close",
			(element): element is HTMLButtonElement =>
				element instanceof HTMLButtonElement,
		);
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
		const revokeBtn = getElement(
			overlay,
			"#aperture-status-btn-revoke",
			(element): element is HTMLButtonElement =>
				element instanceof HTMLButtonElement,
		);
		revokeBtn.click();

		expect(revokeFn).toHaveBeenCalled();
		expect(changeFn).toHaveBeenCalledWith({
			approved: false,
			denied: false,
			capabilities: [],
			stream: null,
		});
	});

	test("reset state returns a denied session to pending", () => {
		const revokeFn = vi.fn();
		const changeFn = vi.fn();

		showStatusDialog({
			wsReadyState: 3,
			approved: false,
			denied: true,
			capabilities: [],
			isBadgeHidden: () => false,
			showBadge: vi.fn(),
			hideBadgeFor24h: vi.fn(),
			revokeApproval: revokeFn,
			onApprovalStateChange: changeFn,
		});

		const overlay = document.getElementById("aperture-dialog-overlay");
		getElement(
			overlay,
			"#aperture-status-btn-revoke",
			(element): element is HTMLButtonElement =>
				element instanceof HTMLButtonElement,
		).click();

		expect(revokeFn).toHaveBeenCalledOnce();
		expect(changeFn).toHaveBeenCalledWith({
			approved: false,
			denied: false,
			capabilities: [],
			stream: null,
		});
	});

	test("shows screenshot permission dialog only when capture needs a gesture", async () => {
		const getDisplayMedia = vi
			.fn()
			.mockRejectedValueOnce(
				Object.assign(new Error("User activation is required"), {
					name: "InvalidStateError",
				}),
			)
			.mockResolvedValueOnce({ active: true } as MediaStream);
		Object.defineProperty(navigator, "mediaDevices", {
			configurable: true,
			value: { getDisplayMedia },
		});

		const capture = requestDisplayMedia();
		await expect(capture).resolves.toMatchObject({
			stream: null,
			needsGesture: true,
		});

		const permission = showScreenshotPermissionDialog();
		const overlay = document.getElementById("aperture-dialog-overlay");
		const allowBtn = getElement(
			overlay,
			".aperture-btn-allow",
			(element): element is HTMLButtonElement =>
				element instanceof HTMLButtonElement,
		);
		allowBtn.click();

		await expect(permission).resolves.toBeTruthy();
		expect(getDisplayMedia).toHaveBeenCalledTimes(2);
		expect(getDisplayMedia.mock.calls[1]?.[0]).toMatchObject({
			video: { displaySurface: "browser" },
		});
	});

	test("falls back to plain video only for unsupported constraints", async () => {
		const originalMediaDevices = navigator.mediaDevices;
		const getDisplayMedia = vi
			.fn()
			.mockRejectedValueOnce(new TypeError("Unsupported constraint"))
			.mockResolvedValueOnce({ active: true } as MediaStream);
		Object.defineProperty(navigator, "mediaDevices", {
			configurable: true,
			value: { getDisplayMedia },
		});

		await expect(requestDisplayMedia()).resolves.toMatchObject({
			needsGesture: false,
			stream: { active: true },
		});
		expect(getDisplayMedia).toHaveBeenNthCalledWith(2, {
			video: true,
			audio: false,
		});

		Object.defineProperty(navigator, "mediaDevices", {
			configurable: true,
			value: originalMediaDevices,
		});
	});
});
