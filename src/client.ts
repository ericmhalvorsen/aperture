/**
 * Browser-side bridge client.
 * Auto-connects to the bridge server and exposes browser APIs to MCP agents.
 */

export interface CustomToolDefinition {
	description: string;
	inputSchema: object;
	handler: (client: ApertureClient, args: Record<string, any>) => any | Promise<any>;
}

interface BridgeConfig {
	serverUrl: string;
	onApprovalRequest?: (
		agentName: string,
	) => Promise<{ approved: boolean; capabilities: string[]; dismissed?: boolean }>;
	customTools?: Record<string, CustomToolDefinition>;
}

interface ConsoleEntry {
	level: string;
	message: string;
	timestamp: number;
}

interface NetworkEntry {
	url: string;
	method: string;
	start: number;
	end: number;
	status: number;
	responseText: string;
	error?: string;
}

const consoleBuffer: ConsoleEntry[] = [];
const networkBuffer: NetworkEntry[] = [];

function patchConsole() {
	const levels = ["log", "warn", "error", "info", "debug"] as const;
	for (const level of levels) {
		const orig = (console as unknown as Record<string, unknown>)[level] as (
			...args: unknown[]
		) => void;
		(console as unknown as Record<string, unknown>)[level] = (
			...args: unknown[]
		) => {
			const message = args
				.map((a) => (typeof a === "string" ? a : JSON.stringify(a)))
				.join(" ");
			consoleBuffer.push({ level, message, timestamp: Date.now() });
			if (consoleBuffer.length > 500) consoleBuffer.shift();
			orig(...args);
		};
	}
}

function patchFetch() {
	const origFetch = window.fetch;
	window.fetch = async (...args: Parameters<typeof window.fetch>) => {
		const entry: NetworkEntry = {
			url: String(args[0]),
			method: "GET",
			start: Date.now(),
			end: 0,
			status: 0,
			responseText: "",
		};
		if (args[1]) {
			entry.method = args[1].method || "GET";
		}
		try {
			const res = await origFetch(...args);
			entry.status = res.status;
			entry.end = Date.now();
			networkBuffer.push(entry);
			if (networkBuffer.length > 100) networkBuffer.shift();
			return res;
		} catch (err) {
			entry.end = Date.now();
			entry.error = String(err);
			networkBuffer.push(entry);
			if (networkBuffer.length > 100) networkBuffer.shift();
			throw err;
		}
	};
}

function injectStyles() {
	if (typeof document === "undefined") return;
	const styleId = "aperture-styles";
	if (document.getElementById(styleId)) return;
	const style = document.createElement("style");
	style.id = styleId;
	style.textContent = `
    /* Aperture — self-contained dev-tool overlay styles.
       Uses CSS custom properties so the dialog adapts to the host
       page's color-scheme preference while remaining isolated. */

    :root {
      --ap-bg: #0f0f10;
      --ap-bg-glass: rgba(15, 15, 16, 0.92);
      --ap-border: rgba(255, 255, 255, 0.10);
      --ap-text: #f3f4f6;
      --ap-text-secondary: #9ca3af;
      --ap-text-muted: #6b7280;
      --ap-accent: #6366f1;
      --ap-accent-hover: #4f46e5;
      --ap-btn-deny-bg: rgba(255, 255, 255, 0.06);
      --ap-btn-deny-border: rgba(255, 255, 255, 0.12);
      --ap-btn-deny-text: #d1d5db;
      --ap-warning-bg: rgba(239, 68, 68, 0.10);
      --ap-warning-border: rgba(239, 68, 68, 0.25);
      --ap-warning-text: #fca5a5;
      --ap-shadow: 0 24px 64px rgba(0, 0, 0, 0.50);
    }

    @media (prefers-color-scheme: light) {
      :root {
        --ap-bg: #ffffff;
        --ap-bg-glass: rgba(255, 255, 255, 0.96);
        --ap-border: rgba(0, 0, 0, 0.10);
        --ap-text: #111827;
        --ap-text-secondary: #4b5563;
        --ap-text-muted: #9ca3af;
        --ap-btn-deny-bg: rgba(0, 0, 0, 0.04);
        --ap-btn-deny-border: rgba(0, 0, 0, 0.10);
        --ap-btn-deny-text: #374151;
        --ap-warning-bg: rgba(239, 68, 68, 0.06);
        --ap-warning-border: rgba(239, 68, 68, 0.18);
        --ap-warning-text: #b91c1c;
        --ap-shadow: 0 24px 64px rgba(0, 0, 0, 0.15);
      }
    }

    #aperture-badge,
    #aperture-dialog-overlay,
    #aperture-dialog,
    #aperture-dialog .aperture-header,
    #aperture-dialog .aperture-icon,
    #aperture-dialog .aperture-title-container,
    #aperture-dialog .aperture-title,
    #aperture-dialog .aperture-subtitle,
    #aperture-dialog .aperture-body,
    #aperture-dialog .aperture-list,
    #aperture-dialog .aperture-list li,
    #aperture-dialog .aperture-options,
    #aperture-dialog .aperture-checkbox-label,
    #aperture-dialog .aperture-checkbox-label input,
    #aperture-dialog .aperture-checkbox-desc,
    #aperture-dialog .aperture-warning-box,
    #aperture-dialog .aperture-footer,
    #aperture-dialog .aperture-btn {
      all: initial;
      box-sizing: border-box;
      font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    }

    #aperture-badge {
      position: fixed;
      bottom: 12px;
      right: 12px;
      z-index: 2147483646;
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 6px 12px;
      border-radius: 20px;
      background: var(--ap-bg-glass);
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      border: 1px solid var(--ap-border);
      color: var(--ap-text);
      font-size: 11px;
      font-weight: 500;
      box-shadow: var(--ap-shadow);
      transition: transform 0.2s ease, box-shadow 0.2s ease;
      cursor: pointer;
      user-select: none;
    }

    #aperture-badge:hover {
      transform: translateY(-2px);
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.30);
    }

    #aperture-badge .dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      transition: background-color 0.3s ease;
    }

    #aperture-badge .dot.connected {
      background-color: #10b981;
      box-shadow: 0 0 8px #10b981;
      animation: aperture-pulse 2s infinite;
    }

    #aperture-badge .dot.connecting {
      background-color: #f59e0b;
      box-shadow: 0 0 8px #f59e0b;
    }

    #aperture-badge .dot.disconnected {
      background-color: #ef4444;
      box-shadow: 0 0 8px #ef4444;
    }

    @keyframes aperture-pulse {
      0% { transform: scale(1); opacity: 1; }
      50% { transform: scale(1.2); opacity: 0.7; }
      100% { transform: scale(1); opacity: 1; }
    }

    #aperture-dialog-overlay {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.45);
      backdrop-filter: blur(6px);
      -webkit-backdrop-filter: blur(6px);
      z-index: 2147483647;
      display: flex;
      align-items: center;
      justify-content: center;
      opacity: 0;
      transition: opacity 0.2s ease;
      color-scheme: light dark;
    }

    #aperture-dialog {
      background: var(--ap-bg-glass);
      backdrop-filter: blur(20px);
      -webkit-backdrop-filter: blur(20px);
      border: 1px solid var(--ap-border);
      border-radius: 16px;
      width: 400px;
      max-width: 92vw;
      max-height: 90vh;
      overflow-y: auto;
      box-shadow: var(--ap-shadow);
      padding: 24px;
      color: var(--ap-text);
      transform: scale(0.96);
      transition: transform 0.2s cubic-bezier(0.16, 1, 0.3, 1);
      line-height: 1.5;
    }

    #aperture-dialog-overlay.active {
      opacity: 1;
    }

    #aperture-dialog-overlay.active #aperture-dialog {
      transform: scale(1);
    }

    #aperture-dialog .aperture-header {
      display: flex;
      align-items: center;
      gap: 14px;
      margin-bottom: 20px;
    }

    #aperture-dialog .aperture-icon {
      width: 42px;
      height: 42px;
      border-radius: 12px;
      background: linear-gradient(135deg, var(--ap-accent), var(--ap-accent-hover));
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 20px;
      line-height: 1;
      flex-shrink: 0;
    }

    #aperture-dialog .aperture-title-container {
      display: flex;
      flex-direction: column;
    }

    #aperture-dialog .aperture-title {
      font-size: 16px;
      font-weight: 600;
      color: var(--ap-text);
      margin: 0;
    }

    #aperture-dialog .aperture-subtitle {
      font-size: 12px;
      color: var(--ap-text-secondary);
      margin: 2px 0 0 0;
    }

    #aperture-dialog .aperture-body {
      font-size: 13px;
      color: var(--ap-text-secondary);
      margin-bottom: 20px;
    }

    #aperture-dialog .aperture-list {
      margin: 8px 0 0 18px;
      padding: 0;
      color: var(--ap-text-muted);
      list-style-type: disc;
    }

    #aperture-dialog .aperture-list li {
      margin-bottom: 5px;
      font-size: 12px;
    }

    #aperture-dialog .aperture-options {
      display: flex;
      flex-direction: column;
      gap: 14px;
      margin-bottom: 20px;
      border-top: 1px solid var(--ap-border);
      border-bottom: 1px solid var(--ap-border);
      padding: 16px 0;
    }

    #aperture-dialog .aperture-checkbox-label {
      display: flex;
      align-items: flex-start;
      gap: 10px;
      font-size: 13px;
      color: var(--ap-text);
      cursor: pointer;
      user-select: none;
      line-height: 1.4;
    }

    #aperture-dialog .aperture-checkbox-label input[type="checkbox"] {
      margin-top: 2px;
      width: 16px;
      height: 16px;
      accent-color: var(--ap-accent);
      cursor: pointer;
      flex-shrink: 0;
    }

    #aperture-dialog .aperture-checkbox-desc {
      font-size: 11px;
      color: var(--ap-text-muted);
      margin-top: 2px;
      display: block;
      line-height: 1.35;
    }

    #aperture-dialog .aperture-warning-box {
      background: var(--ap-warning-bg);
      border: 1px solid var(--ap-warning-border);
      border-radius: 8px;
      padding: 10px 12px;
      margin-top: 6px;
      margin-left: 26px;
      font-size: 12px;
      color: var(--ap-warning-text);
      display: none;
      line-height: 1.4;
    }

    #aperture-dialog .aperture-warning-box.visible {
      display: block;
    }

    #aperture-dialog .aperture-footer {
      display: flex;
      gap: 10px;
      justify-content: flex-end;
      flex-wrap: wrap;
    }

    #aperture-dialog .aperture-btn {
      padding: 8px 14px;
      font-size: 13px;
      font-weight: 500;
      border-radius: 8px;
      cursor: pointer;
      transition: all 0.15s ease;
      border: 1px solid transparent;
      white-space: nowrap;
      line-height: 1;
    }

    #aperture-dialog .aperture-btn-deny {
      background: var(--ap-btn-deny-bg);
      color: var(--ap-btn-deny-text);
      border-color: var(--ap-btn-deny-border);
    }

    #aperture-dialog .aperture-btn-deny:hover {
      background: var(--ap-btn-deny-text);
      color: var(--ap-bg);
      border-color: var(--ap-btn-deny-text);
    }

    #aperture-dialog .aperture-btn-allow {
      background: linear-gradient(135deg, var(--ap-accent), var(--ap-accent-hover));
      color: #fff;
      border-color: transparent;
    }

    #aperture-dialog .aperture-btn-allow:hover {
      transform: translateY(-1px);
      box-shadow: 0 4px 12px rgba(99, 102, 241, 0.35);
    }
  `;
	document.head.appendChild(style);
}

const TOOL_HANDLERS: Record<
	string,
	(client: ApertureClient, args: Record<string, any>) => any
> = {
	browser_console_logs: (_client, { level = "all", limit = 50 }) => {
		let entries = consoleBuffer;
		if (level !== "all") {
			entries = entries.filter((e) => e.level === level);
		}
		return entries.slice(-Number(limit));
	},

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

	browser_dom_snapshot: (_client, { maxChars = 4000 }) => {
		const text = document.body.innerText || "";
		return {
			url: window.location.href,
			title: document.title,
			text: text.slice(0, Number(maxChars)),
			truncated: text.length > Number(maxChars),
		};
	},

	browser_network_requests: (_client, { limit = 20 }) => {
		return networkBuffer.slice(-Number(limit));
	},

	browser_localstorage_get: (_client, { key, prefix }) => {
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

		// Focus the element
		element.focus();

		// Trigger standard sequence of mouse events for better compatibility
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

	browser_page_info: () => {
		return {
			url: window.location.href,
			title: document.title,
			width: window.innerWidth,
			height: window.innerHeight,
			scrollX: window.scrollX,
			scrollY: window.scrollY,
			userAgent: navigator.userAgent,
		};
	},

	browser_cookie_get: (_client, { name }) => {
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
	},
};

export class ApertureClient {
	private ws: WebSocket | null = null;
	private config: BridgeConfig;
	private approved = false;
	private denied = false;
	private capabilities: string[] = [];
	private screenCaptureStream: MediaStream | null = null;
	private badgeElement: HTMLElement | null = null;

	constructor(config: BridgeConfig) {
		this.config = config;
		(window as any).__apertureInstance__ = this;

		injectStyles();
		patchConsole();
		patchFetch();
		this.loadCachedApproval();

		if (typeof window !== "undefined") {
			window.addEventListener("beforeunload", () => {
				this.stopScreenCapture();
			});
		}
	}

	private loadCachedApproval() {
		if (typeof window === "undefined" || typeof localStorage === "undefined")
			return;
		try {
			const approved = localStorage.getItem("aperture_approved");
			const timestamp = localStorage.getItem("aperture_approved_at");
			const storedTtl = localStorage.getItem("aperture_ttl_ms");
			const defaultTtlMs = 60 * 60 * 1000; // 1 hour default
			const ttlMs = storedTtl ? Number(storedTtl) : defaultTtlMs;

			const isStale = timestamp ? Date.now() - Number(timestamp) > ttlMs : true;

			if (approved === "true" && !isStale) {
				this.approved = true;
				this.denied = false;
				this.capabilities = JSON.parse(
					localStorage.getItem("aperture_capabilities") || "[]",
				);
			} else if (approved === "false") {
				this.denied = true;
				this.approved = false;
			}

			// Clear stale cache
			if (isStale) {
				localStorage.removeItem("aperture_approved");
				localStorage.removeItem("aperture_approved_at");
				localStorage.removeItem("aperture_capabilities");
				localStorage.removeItem("aperture_ttl_ms");
			}
		} catch {
			// ignore
		}
	}

	private saveApproval(
		approved: boolean,
		capabilities: string[],
		ttlMs?: number,
	) {
		if (typeof window === "undefined" || typeof localStorage === "undefined")
			return;
		try {
			if (approved) {
				localStorage.setItem("aperture_approved", "true");
				localStorage.setItem("aperture_approved_at", String(Date.now()));
				localStorage.setItem(
					"aperture_capabilities",
					JSON.stringify(capabilities),
				);
				if (ttlMs) {
					localStorage.setItem("aperture_ttl_ms", String(ttlMs));
				}
			} else {
				localStorage.setItem("aperture_approved", "false");
				localStorage.removeItem("aperture_approved_at");
				localStorage.removeItem("aperture_capabilities");
				localStorage.removeItem("aperture_ttl_ms");
			}
		} catch {
			// ignore
		}
	}

	private revokeApproval() {
		if (typeof window === "undefined" || typeof localStorage === "undefined")
			return;
		try {
			localStorage.removeItem("aperture_approved");
			localStorage.removeItem("aperture_approved_at");
			localStorage.removeItem("aperture_capabilities");
			localStorage.removeItem("aperture_ttl_ms");
			this.approved = false;
			this.denied = false;
			this.capabilities = [];
		} catch {
			// ignore
		}
	}

	connect() {
		const url = new URL("/mcp", this.config.serverUrl);
		url.searchParams.set("type", "browser");

		this.updateBadge("connecting");
		this.ws = new WebSocket(url.toString());

		this.ws.onopen = () => {
			const customToolsPayload = this.config.customTools 
				? Object.entries(this.config.customTools).map(([name, def]) => ({
						name,
						description: def.description,
						inputSchema: def.inputSchema
					}))
				: [];

			this.send({
				type: "register",
				url: window.location.href,
				title: document.title,
				customTools: customToolsPayload,
			});
			console.log("[Aperture] Connected to server");
			this.updateBadge("connected");

			if (this.approved) {
				this.send({
					type: "approval",
					approved: this.approved,
					capabilities: this.capabilities,
				});
			}
		};

		this.ws.onmessage = async (event) => {
			try {
				const msg = JSON.parse(event.data);
				if (msg.type === "tool_call") {
					await this.handleToolCall(msg);
			} else if (msg.type === "agent_connected") {
				if (!this.approved && !this.denied) {
					const decision = await this.getApproval("MCP Agent");
					if (decision.dismissed) {
						return;
					}
					this.approved = decision.approved;
					this.denied = !decision.approved;
					this.capabilities = decision.capabilities;
					this.saveApproval(this.approved, this.capabilities, decision.ttlMs);
					this.send({
						type: "approval",
						approved: this.approved,
						capabilities: this.capabilities,
					});
				}
			}
			} catch {
				// ignore
			}
		};

		this.ws.onclose = () => {
			console.log("[Aperture] Disconnected. Retrying in 3s...");
			this.updateBadge("disconnected");
			this.stopScreenCapture();
			setTimeout(() => this.connect(), 3000);
		};
	}

	disconnect() {
		if (this.ws) {
			this.ws.onclose = null;
			this.ws.close();
			this.ws = null;
		}
		this.stopScreenCapture();
		if (this.badgeElement) {
			this.badgeElement.remove();
			this.badgeElement = null;
		}
	}

	private send(msg: unknown) {
		if (this.ws?.readyState === WebSocket.OPEN) {
			this.ws.send(JSON.stringify(msg));
		}
	}

	private updateBadge(status: "disconnected" | "connecting" | "connected") {
		if (typeof document === "undefined") return;
		if (!this.badgeElement) {
			this.badgeElement = document.createElement("div");
			this.badgeElement.id = "aperture-badge";
			this.badgeElement.title = "Manage Aperture session";

			const dot = document.createElement("span");
			dot.className = "dot";

			const text = document.createTextNode(" Aperture");

			this.badgeElement.appendChild(dot);
			this.badgeElement.appendChild(text);
			this.badgeElement.addEventListener("click", () => {
				this.showStatusDialog();
			});
			document.body.appendChild(this.badgeElement);
		}

		const dot = this.badgeElement.querySelector(".dot");
		if (dot) {
			dot.className = `dot ${status}`;
		}
	}

	private async handleToolCall(msg: {
		requestId: string;
		tool: string;
		args: Record<string, unknown>;
	}) {
		if (this.denied) {
			this.send({
				type: "result",
				requestId: msg.requestId,
				result: { error: "User denied browser access" },
			});
			return;
		}

		// Ask user for approval on first tool call
		if (!this.approved) {
			const decision = await this.getApproval("MCP Agent");
			if (decision.dismissed) {
				this.send({
					type: "result",
					requestId: msg.requestId,
					result: { error: "User dismissed the approval request" },
				});
				return;
			}
			this.approved = decision.approved;
			this.denied = !decision.approved;
			this.capabilities = decision.capabilities;
			this.saveApproval(this.approved, this.capabilities, decision.ttlMs);
			this.send({
				type: "approval",
				approved: this.approved,
				capabilities: this.capabilities,
			});

			if (!this.approved) {
				this.send({
					type: "result",
					requestId: msg.requestId,
					result: { error: "User denied browser access" },
				});
				return;
			}
		}

		const builtInHandler = TOOL_HANDLERS[msg.tool];
		const customHandler = this.config.customTools?.[msg.tool]?.handler;
		const handler = builtInHandler || customHandler;
		
		if (!handler) {
			this.send({
				type: "result",
				requestId: msg.requestId,
				result: { error: `Unknown tool: ${msg.tool}` },
			});
			return;
		}

		try {
			const result = await handler(this, msg.args);
			this.send({ type: "result", requestId: msg.requestId, result });
		} catch (err: unknown) {
			this.send({
				type: "result",
				requestId: msg.requestId,
				result: { error: err instanceof Error ? err.message : String(err) },
			});
		}
	}

	private async getApproval(
		agentName: string,
	): Promise<{ approved: boolean; capabilities: string[]; ttlMs?: number; dismissed?: boolean }> {
		if (this.config.onApprovalRequest) {
			const result = await this.config.onApprovalRequest(agentName);
			return { ...result, dismissed: false };
		}
		return this.showVanillaApprovalDialog(agentName);
	}

	private showVanillaApprovalDialog(
		agentName: string,
	): Promise<{ approved: boolean; capabilities: string[]; ttlMs?: number; dismissed?: boolean }> {
		return new Promise((resolve) => {
			if (typeof document === "undefined") {
				resolve({ approved: false, capabilities: [] });
				return;
			}

			const overlay = document.createElement("div");
			overlay.id = "aperture-dialog-overlay";

			overlay.innerHTML = `
        <div id="aperture-dialog">
          <div class="aperture-header">
            <div class="aperture-icon">🔌</div>
            <div class="aperture-title-container">
              <h3 class="aperture-title">Aperture</h3>
              <p class="aperture-subtitle">${agentName} wants to access this tab</p>
            </div>
          </div>

          <div class="aperture-body">
            By allowing, the agent will be able to:
            <ul class="aperture-list">
              <li>Read the current page URL, title, and visible text</li>
              <li>Query the DOM and read element attributes / contents</li>
              <li>View console logs (errors, warnings, info, debug)</li>
              <li>Monitor network requests made by this page</li>
              <li>Read localStorage and cookies for this origin</li>
              <li id="aperture-perm-screenshot">Capture screenshots of the page</li>
              <li id="aperture-perm-eval">Execute arbitrary JavaScript in this page</li>
            </ul>
          </div>

          <div class="aperture-options">
            <label class="aperture-checkbox-label">
              <input type="checkbox" id="aperture-allow-screenshot" checked />
              <div>
                <strong>Allow screenshot capture</strong>
                <div class="aperture-checkbox-desc">Requests browser tab/screen sharing for live views</div>
              </div>
            </label>

            <label class="aperture-checkbox-label">
              <input type="checkbox" id="aperture-allow-eval" checked />
              <div>
                <strong>Allow JavaScript evaluation</strong>
                <div class="aperture-checkbox-desc">Enables arbitrary JS execution in this page (dangerous)</div>
              </div>
            </label>

            <label class="aperture-checkbox-label">
              <input type="checkbox" id="aperture-remember-24h" checked />
              <div>
                <strong>Trust this device for 24 hours</strong>
                <div class="aperture-checkbox-desc">Otherwise approval resets after 1 hour</div>
              </div>
            </label>

            <div id="aperture-eval-warning" class="aperture-warning-box visible">
              ⚠️ Warning: Allowing evaluation lets the agent run any command or access any sensitive data on this origin.
            </div>
          </div>

          <div class="aperture-footer">
            <button id="aperture-btn-dismiss" class="aperture-btn aperture-btn-deny">Dismiss</button>
            <button id="aperture-btn-deny" class="aperture-btn aperture-btn-deny">Deny</button>
            <button id="aperture-btn-allow" class="aperture-btn aperture-btn-allow">Allow for this session</button>
          </div>
        </div>
      `;

			document.body.appendChild(overlay);

			setTimeout(() => {
				overlay.classList.add("active");
			}, 10);

			const evalCheckbox = overlay.querySelector(
				"#aperture-allow-eval",
			) as HTMLInputElement;
			const warningBox = overlay.querySelector(
				"#aperture-eval-warning",
			) as HTMLElement;
			const screenshotPerm = overlay.querySelector(
				"#aperture-perm-screenshot",
			) as HTMLElement;
			const evalPerm = overlay.querySelector(
				"#aperture-perm-eval",
			) as HTMLElement;

			evalCheckbox.addEventListener("change", () => {
				if (evalCheckbox.checked) {
					warningBox.classList.add("visible");
				} else {
					warningBox.classList.remove("visible");
				}
				if (evalPerm) evalPerm.style.display = evalCheckbox.checked ? "list-item" : "none";
			});

			const screenshotCheckbox = overlay.querySelector(
				"#aperture-allow-screenshot",
			) as HTMLInputElement;
			screenshotCheckbox.addEventListener("change", () => {
				if (screenshotPerm) screenshotPerm.style.display = screenshotCheckbox.checked ? "list-item" : "none";
			});

			const cleanup = () => {
				overlay.classList.remove("active");
				setTimeout(() => {
					overlay.remove();
				}, 300);
			};

			overlay
				.querySelector("#aperture-btn-dismiss")
				?.addEventListener("click", () => {
					cleanup();
					resolve({ approved: false, capabilities: [], dismissed: true });
				});

			overlay
				.querySelector("#aperture-btn-deny")
				?.addEventListener("click", () => {
					cleanup();
					resolve({ approved: false, capabilities: [] });
				});

			overlay
				.querySelector("#aperture-btn-allow")
				?.addEventListener("click", async () => {
					const allowScreenshot = (
						overlay.querySelector(
							"#aperture-allow-screenshot",
						) as HTMLInputElement
					).checked;
					const allowEval = evalCheckbox.checked;
					const remember24h = (
						overlay.querySelector("#aperture-remember-24h") as HTMLInputElement
					).checked;

					const ttlMs = remember24h ? 24 * 60 * 60 * 1000 : 60 * 60 * 1000;

					const capabilities = ["console", "dom", "network", "storage"];
					if (allowEval) capabilities.push("evaluate");

					if (allowScreenshot) {
						try {
							const stream = await navigator.mediaDevices.getDisplayMedia({
								video: {
									displaySurface: "browser",
								},
								audio: false,
							} as any);
							this.screenCaptureStream = stream;
							capabilities.push("screenshot");
						} catch (err) {
							console.warn(
								"[Aperture] Failed to acquire screen share stream for screenshots:",
								err,
							);
						}
					}

					cleanup();
					resolve({ approved: true, capabilities, ttlMs });
				});
		});
	}

	async captureScreenshotFromStream(): Promise<string> {
		if (!this.screenCaptureStream?.active) {
			throw new Error(
				"No active screen capture stream. Make sure you approved screenshot access.",
			);
		}
		const track = this.screenCaptureStream.getVideoTracks()[0];
		if (!track) {
			throw new Error("No video tracks found in screen capture stream.");
		}

		const video = document.createElement("video");
		video.srcObject = this.screenCaptureStream;
		video.autoplay = true;
		video.playsInline = true;
		video.muted = true;

		await new Promise((resolve) => {
			video.onloadedmetadata = () => resolve(null);
		});

		// Tiny delay to ensure video renders a frame
		await new Promise((resolve) => setTimeout(resolve, 150));

		const canvas = document.createElement("canvas");
		canvas.width = video.videoWidth || 800;
		canvas.height = video.videoHeight || 600;
		const ctx = canvas.getContext("2d");
		if (!ctx) {
			throw new Error("Could not get 2D context from canvas");
		}
		ctx.drawImage(video, 0, 0);
		const dataUrl = canvas.toDataURL("image/png");

		// Clean up temporary video element reference
		video.srcObject = null;
		video.load();

		return dataUrl;
	}

	stopScreenCapture() {
		if (this.screenCaptureStream) {
			for (const track of this.screenCaptureStream.getTracks()) {
				track.stop();
			}
			this.screenCaptureStream = null;
		}
	}

	setMediaStream(stream: MediaStream) {
		this.screenCaptureStream = stream;
	}

	private showStatusDialog() {
		if (typeof document === "undefined") return;
		if (document.getElementById("aperture-dialog-overlay")) return;

		const overlay = document.createElement("div");
		overlay.id = "aperture-dialog-overlay";

		const connectionStatus =
			this.ws && this.ws.readyState === WebSocket.OPEN
				? "Connected"
				: "Disconnected";
		const sessionStatus = this.denied
			? "Denied"
			: this.approved
				? "Approved"
				: "Pending Approval";

		const hasScreenshot = this.capabilities.includes("screenshot");
		const hasEval = this.capabilities.includes("evaluate");

		const footerHtml = this.approved
			? `
            <button id="aperture-status-btn-revoke" class="aperture-btn aperture-btn-deny" style="flex: 1.5;">Revoke Session</button>
            <button id="aperture-status-btn-close" class="aperture-btn aperture-btn-allow" style="flex: 1;">Close</button>
			`
			: `
            <button id="aperture-status-btn-deny" class="aperture-btn aperture-btn-deny">Deny</button>
            <button id="aperture-status-btn-allow" class="aperture-btn aperture-btn-allow">Allow for this session</button>
			`;

		overlay.innerHTML = `
        <div id="aperture-dialog">
          <div class="aperture-header">
            <div class="aperture-icon">⚙️</div>
            <div class="aperture-title-container">
              <h3 class="aperture-title">Aperture Settings</h3>
              <p class="aperture-subtitle">Local agent session management</p>
            </div>
          </div>
          
          <div class="aperture-body">
            <div style="margin-bottom: 12px; display: flex; justify-content: space-between; font-size: 13px;">
              <span>Server Connection:</span>
              <strong style="color: ${connectionStatus === "Connected" ? "#10b981" : "#ef4444"};">${connectionStatus}</strong>
            </div>
            <div style="margin-bottom: 16px; display: flex; justify-content: space-between; font-size: 13px;">
              <span>Session Status:</span>
              <strong style="color: ${sessionStatus === "Approved" ? "#10b981" : sessionStatus === "Denied" ? "#ef4444" : "#f59e0b"};">${sessionStatus}</strong>
            </div>

            <div class="aperture-options" style="margin-top: 12px; border-top: 1px solid rgba(255, 255, 255, 0.08); padding-top: 12px;">
              <label class="aperture-checkbox-label">
                <input type="checkbox" id="aperture-status-screenshot" ${hasScreenshot ? "checked" : ""} />
                <div>
                  <strong>Allow screenshot capture</strong>
                  <div class="aperture-checkbox-desc">Requests browser tab/screen sharing for live views</div>
                </div>
              </label>
              
              <label class="aperture-checkbox-label">
                <input type="checkbox" id="aperture-status-eval" ${hasEval ? "checked" : ""} />
                <div>
                  <strong>Allow JavaScript evaluation</strong>
                  <div class="aperture-checkbox-desc">Enables arbitrary JS execution in this page (dangerous)</div>
                </div>
              </label>
            </div>
          </div>
          
          <div class="aperture-footer">
            ${footerHtml}
          </div>
        </div>
      `;

		document.body.appendChild(overlay);

		setTimeout(() => {
			overlay.classList.add("active");
		}, 10);

		const cleanup = () => {
			overlay.classList.remove("active");
			setTimeout(() => {
				overlay.remove();
			}, 300);
		};

		if (this.approved) {
			overlay
				.querySelector("#aperture-status-btn-close")
				?.addEventListener("click", cleanup);

			overlay
				.querySelector("#aperture-status-btn-revoke")
				?.addEventListener("click", () => {
					this.revokeApproval();
					this.stopScreenCapture();
					this.send({
						type: "approval",
						approved: false,
						capabilities: [],
					});
					cleanup();
				});

			const screenshotCheckbox = overlay.querySelector(
				"#aperture-status-screenshot",
			) as HTMLInputElement;
			const evalCheckbox = overlay.querySelector(
				"#aperture-status-eval",
			) as HTMLInputElement;

			screenshotCheckbox?.addEventListener("change", async () => {
				if (screenshotCheckbox.checked) {
					try {
						const stream = await navigator.mediaDevices.getDisplayMedia({
							video: { displaySurface: "browser" },
							audio: false,
						});
						this.screenCaptureStream = stream;
						if (!this.capabilities.includes("screenshot")) {
							this.capabilities.push("screenshot");
						}
					} catch (err) {
						screenshotCheckbox.checked = false;
					}
				} else {
					this.stopScreenCapture();
					this.capabilities = this.capabilities.filter(
						(c) => c !== "screenshot",
					);
				}
				this.saveApproval(this.approved, this.capabilities);
				this.send({
					type: "approval",
					approved: this.approved,
					capabilities: this.capabilities,
				});
			});

			evalCheckbox?.addEventListener("change", () => {
				if (evalCheckbox.checked) {
					if (!this.capabilities.includes("evaluate")) {
						this.capabilities.push("evaluate");
					}
				} else {
					this.capabilities = this.capabilities.filter((c) => c !== "evaluate");
				}
				this.saveApproval(this.approved, this.capabilities);
				this.send({
					type: "approval",
					approved: this.approved,
					capabilities: this.capabilities,
				});
			});
		} else {
			overlay
				.querySelector("#aperture-status-btn-deny")
				?.addEventListener("click", () => {
					this.approved = false;
					this.denied = true;
					this.capabilities = [];
					this.saveApproval(false, []);
					this.send({
						type: "approval",
						approved: false,
						capabilities: [],
					});
					cleanup();
				});

			overlay
				.querySelector("#aperture-status-btn-allow")
				?.addEventListener("click", async () => {
					const screenshotCheckbox = overlay.querySelector(
						"#aperture-status-screenshot",
					) as HTMLInputElement;
					const evalCheckbox = overlay.querySelector(
						"#aperture-status-eval",
					) as HTMLInputElement;

					const capabilities = ["console", "dom", "network", "storage"];
					if (evalCheckbox.checked) capabilities.push("evaluate");

					if (screenshotCheckbox.checked) {
						try {
							const stream = await navigator.mediaDevices.getDisplayMedia({
								video: { displaySurface: "browser" },
								audio: false,
							});
							this.screenCaptureStream = stream;
							capabilities.push("screenshot");
						} catch (err) {
							// ignore or keep screenshot off
						}
					}

					this.approved = true;
					this.denied = false;
					this.capabilities = capabilities;
					this.saveApproval(true, this.capabilities);
					this.send({
						type: "approval",
						approved: true,
						capabilities: this.capabilities,
					});
					cleanup();
				});
		}
	}
}

export function initAperture(options?: { port?: number; serverUrl?: string; customTools?: Record<string, CustomToolDefinition> }) {
	if (typeof window === "undefined") return;

	const isDev =
		location.hostname === "localhost" ||
		location.hostname === "127.0.0.1" ||
		location.hostname.endsWith(".localhost") ||
		!!(window as any).__vite_inject__;

	if (!isDev) return;

	const port = options?.port || (window as any).__APERTURE_PORT__ || 3456;
	const serverUrl = options?.serverUrl || `ws://localhost:${port}`;

	// Disconnect existing instance if any
	const existing = (window as any).__apertureInstance__;
	if (existing && typeof existing.disconnect === "function") {
		existing.disconnect();
	}

	const client = new ApertureClient({ serverUrl, customTools: options?.customTools });
	client.connect();
	(window as any).__apertureInstance__ = client;
	return client;
}

// Auto-connect if running in browser and not already connected
if (typeof window !== "undefined") {
	// Only auto-connect in dev mode
	const isDev =
		location.hostname === "localhost" ||
		location.hostname === "127.0.0.1" ||
		location.hostname.endsWith(".localhost") ||
		!!(window as any).__vite_inject__;

	if (isDev) {
		// Defer to check if manual initialization occurs
		setTimeout(() => {
			if (!(window as any).__apertureInstance__) {
				const port = (window as any).__APERTURE_PORT__ || 3456;
				const serverUrl =
					(window as any).__APERTURE_URL__ || `ws://localhost:${port}`;
				console.log(
					"[Aperture] No manual initialization detected. Auto-connecting...",
				);
				const client = new ApertureClient({ serverUrl });
				client.connect();
				(window as any).__apertureInstance__ = client;
			}
		}, 500);
	}
}
