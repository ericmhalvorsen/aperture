import type { ApertureClient } from "../client.js";
import { getConsoleBuffer, getNetworkBuffer } from "./patches.js";

export const TOOL_HANDLERS: Record<
	string,
	(client: ApertureClient, args: Record<string, any>) => any | Promise<any>
> = {
	browser_dom_query: (_client, { selector, includeHtml = false }) => {
		const elements = Array.from(document.querySelectorAll(String(selector)));
		return elements.map((el) => ({
			tag: el.tagName.toLowerCase(),
			text: el.textContent?.slice(0, 200) || "",
			visible: !!(el as HTMLElement).offsetParent,
			attributes: Object.fromEntries(
				Array.from(el.attributes).map((a) => [a.name, a.value]),
			),
			html: includeHtml ? el.outerHTML.slice(0, 500) : undefined,
		}));
	},

	browser_network_requests: (_client, { limit = 20 }) => {
		return getNetworkBuffer().slice(-Number(limit));
	},

	browser_page_info: (_client, { logLimit = 20, logLevel = "all" }) => {
		let logs = getConsoleBuffer();
		if (logLevel !== "all") {
			logs = logs.filter((e) => e.level === logLevel);
		}
		return {
			url: window.location.href,
			title: document.title,
			width: window.innerWidth,
			height: window.innerHeight,
			scrollX: window.scrollX,
			scrollY: window.scrollY,
			userAgent: navigator.userAgent,
			logs: logs.slice(-Number(logLimit)),
		};
	},

	browser_storage_get: (_client, { type, key, prefix, name }) => {
		if (type === "localStorage") {
			const result: Record<string, string | null> = {};
			if (key) {
				result[String(key)] = localStorage.getItem(String(key));
			}
			if (prefix) {
				for (let i = 0; i < localStorage.length; i++) {
					const k = localStorage.key(i);
					if (k?.startsWith(String(prefix))) {
						result[k] = localStorage.getItem(k);
					}
				}
			}
			return result;
		}

		if (type === "cookie") {
			const cookies: Record<string, string> = {};
			const docCookies = document.cookie;
			if (docCookies) {
				for (const cookie of docCookies.split(";")) {
					const [k, v] = cookie.split("=").map((s) => s.trim());
					if (k) cookies[k] = decodeURIComponent(v || "");
				}
			}
			if (name) {
				const targetName = String(name);
				return { [targetName]: cookies[targetName] || null };
			}
			return cookies;
		}

		return { error: `Unknown type: ${type}. Use 'localStorage' or 'cookie'.` };
	},

	browser_screenshot: async (client) => {
		try {
			const dataUrl = await client.captureScreenshotFromStream();
			return { base64: dataUrl.split(",")[1], format: "png" };
		} catch (e: unknown) {
			return { error: e instanceof Error ? e.message : String(e) };
		}
	},

	browser_evaluate: (_client, { expression }) => {
		// biome-ignore lint/security/noGlobalEval: developer-only bridge, gated by approval
		const result = window.eval(String(expression));
		return {
			result:
				typeof result === "object" ? JSON.stringify(result) : String(result),
		};
	},

	browser_click: (_client, { selector }) => {
		const element = document.querySelector(
			String(selector),
		) as HTMLElement | null;
		if (!element) {
			return { error: `Element not found matching selector: ${selector}` };
		}

		element.focus();

		const events = [
			"pointerdown",
			"mousedown",
			"pointerup",
			"mouseup",
			"click",
		];
		for (const name of events) {
			const ev = new MouseEvent(name, {
				bubbles: true,
				cancelable: true,
			});
			element.dispatchEvent(ev);
		}
		return { success: true };
	},

	browser_type: (_client, { selector, text }) => {
		const element = document.querySelector(
			String(selector),
		) as HTMLElement | null;
		if (!element) {
			return { error: `Element not found matching selector: ${selector}` };
		}

		const isInput = element instanceof HTMLInputElement;
		const isTextArea = element instanceof HTMLTextAreaElement;

		if (isInput || isTextArea) {
			const proto = isInput
				? HTMLInputElement.prototype
				: HTMLTextAreaElement.prototype;
			const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
			if (setter) {
				setter.call(element, String(text));
			} else {
				(element as HTMLInputElement | HTMLTextAreaElement).value =
					String(text);
			}
		} else if (element.isContentEditable) {
			element.textContent = String(text);
		} else {
			return {
				error: `Element is not an input, textarea, or contenteditable.`,
			};
		}

		element.dispatchEvent(new Event("input", { bubbles: true }));
		element.dispatchEvent(new Event("change", { bubbles: true }));
		return { success: true };
	},

	browser_scroll: (_client, { selector, x, y, scrollIntoView }) => {
		if (selector) {
			const element = document.querySelector(
				String(selector),
			) as HTMLElement | null;
			if (!element) {
				return { error: `Element not found matching selector: ${selector}` };
			}
			if (scrollIntoView) {
				element.scrollIntoView({
					behavior: "smooth",
					block: "center",
					inline: "nearest",
				});
				return { success: true };
			}
			if (x !== undefined) element.scrollLeft = Number(x);
			if (y !== undefined) element.scrollTop = Number(y);
			return {
				success: true,
				scrollLeft: element.scrollLeft,
				scrollTop: element.scrollTop,
			};
		} else {
			const posX = x !== undefined ? Number(x) : window.scrollX;
			const posY = y !== undefined ? Number(y) : window.scrollY;
			window.scrollTo({ left: posX, top: posY, behavior: "smooth" });
			return {
				success: true,
				scrollX: window.scrollX,
				scrollY: window.scrollY,
			};
		}
	},
};
