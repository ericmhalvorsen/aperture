/**
 * Browser-side bridge client.
 * Auto-connects to the bridge server and exposes browser APIs to MCP agents.
 */

interface BridgeConfig {
	serverUrl: string;
	onApprovalRequest?: (
		agentName: string,
	) => Promise<{ approved: boolean; capabilities: string[] }>;
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
      background: rgba(18, 18, 18, 0.75);
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      border: 1px solid rgba(255, 255, 255, 0.08);
      font-family: system-ui, -apple-system, sans-serif;
      font-size: 11px;
      font-weight: 500;
      color: rgba(255, 255, 255, 0.85);
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
      transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
      cursor: pointer;
      user-select: none;
    }

    #aperture-badge:hover {
      background: rgba(28, 28, 28, 0.85);
      border-color: rgba(255, 255, 255, 0.15);
      transform: translateY(-2px);
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
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
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.4);
      backdrop-filter: blur(4px);
      -webkit-backdrop-filter: blur(4px);
      z-index: 2147483647;
      display: flex;
      align-items: center;
      justify-content: center;
      opacity: 0;
      transition: opacity 0.2s ease;
      font-family: system-ui, -apple-system, sans-serif;
    }

    #aperture-dialog {
      background: rgba(22, 22, 22, 0.85);
      backdrop-filter: blur(20px);
      -webkit-backdrop-filter: blur(20px);
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 16px;
      width: 380px;
      max-width: 90vw;
      box-shadow: 0 24px 64px rgba(0, 0, 0, 0.5);
      padding: 24px;
      color: #f3f4f6;
      transform: scale(0.95);
      transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
    }

    #aperture-dialog-overlay.active {
      opacity: 1;
    }

    #aperture-dialog-overlay.active #aperture-dialog {
      transform: scale(1);
    }

    .aperture-header {
      display: flex;
      align-items: center;
      gap: 14px;
      margin-bottom: 20px;
    }

    .aperture-icon {
      width: 42px;
      height: 42px;
      border-radius: 12px;
      background: linear-gradient(135deg, #6366f1, #4f46e5);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 20px;
      box-shadow: 0 4px 12px rgba(79, 70, 229, 0.3);
    }

    .aperture-title-container {
      display: flex;
      flex-direction: column;
    }

    .aperture-title {
      font-size: 16px;
      font-weight: 600;
      color: #fff;
      margin: 0;
    }

    .aperture-subtitle {
      font-size: 12px;
      color: #9ca3af;
      margin: 2px 0 0 0;
    }

    .aperture-body {
      font-size: 13px;
      line-height: 1.5;
      color: #d1d5db;
      margin-bottom: 20px;
    }

    .aperture-list {
      margin: 8px 0 0 16px;
      padding: 0;
      color: #9ca3af;
    }

    .aperture-list li {
      margin-bottom: 4px;
    }

    .aperture-options {
      display: flex;
      flex-direction: column;
      gap: 12px;
      margin-bottom: 20px;
      border-top: 1px solid rgba(255, 255, 255, 0.06);
      border-bottom: 1px solid rgba(255, 255, 255, 0.06);
      padding: 16px 0;
    }

    .aperture-checkbox-label {
      display: flex;
      align-items: flex-start;
      gap: 10px;
      font-size: 13px;
      color: #d1d5db;
      cursor: pointer;
      user-select: none;
    }

    .aperture-checkbox-label input {
      margin-top: 3px;
      accent-color: #6366f1;
    }

    .aperture-checkbox-desc {
      font-size: 11px;
      color: #9ca3af;
      margin-top: 2px;
    }

    .aperture-warning-box {
      background: rgba(239, 68, 68, 0.08);
      border: 1px solid rgba(239, 68, 68, 0.2);
      border-radius: 8px;
      padding: 10px 12px;
      margin-top: 6px;
      margin-left: 24px;
      font-size: 12px;
      color: #fca5a5;
      display: none;
    }

    .aperture-warning-box.visible {
      display: block;
    }

    .aperture-footer {
      display: flex;
      gap: 12px;
      justify-content: flex-end;
    }

    .aperture-btn {
      padding: 8px 16px;
      font-size: 13px;
      font-weight: 500;
      border-radius: 8px;
      cursor: pointer;
      transition: all 0.2s ease;
      border: none;
      font-family: inherit;
    }

    .aperture-btn-deny {
      background: rgba(255, 255, 255, 0.05);
      color: #d1d5db;
      border: 1px solid rgba(255, 255, 255, 0.08);
    }

    .aperture-btn-deny:hover {
      background: rgba(255, 255, 255, 0.1);
      color: #fff;
    }

    .aperture-btn-allow {
      background: linear-gradient(135deg, #6366f1, #4f46e5);
      color: #fff;
      box-shadow: 0 4px 12px rgba(79, 70, 229, 0.2);
    }

    .aperture-btn-allow:hover {
      transform: translateY(-1px);
      box-shadow: 0 6px 16px rgba(79, 70, 229, 0.35);
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
			this.send({
				type: "register",
				url: window.location.href,
				title: document.title,
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

		const handler = TOOL_HANDLERS[msg.tool];
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
	): Promise<{ approved: boolean; capabilities: string[]; ttlMs?: number }> {
		if (this.config.onApprovalRequest) {
			return this.config.onApprovalRequest(agentName);
		}
		return this.showVanillaApprovalDialog(agentName);
	}

	private showVanillaApprovalDialog(
		agentName: string,
	): Promise<{ approved: boolean; capabilities: string[]; ttlMs?: number }> {
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
            The agent will be able to read:
            <ul class="aperture-list">
              <li>Console logs</li>
              <li>DOM queries & page text</li>
              <li>Network requests</li>
              <li>localStorage & cookies</li>
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
              <input type="checkbox" id="aperture-allow-eval" />
              <div>
                <strong>Allow JavaScript evaluation</strong>
                <div class="aperture-checkbox-desc">Enables arbitrary JS execution in this page (dangerous)</div>
              </div>
            </label>

            <label class="aperture-checkbox-label">
              <input type="checkbox" id="aperture-remember-24h" />
              <div>
                <strong>Trust this device for 24 hours</strong>
                <div class="aperture-checkbox-desc">Otherwise approval resets after 1 hour</div>
              </div>
            </label>

            <div id="aperture-eval-warning" class="aperture-warning-box">
              ⚠️ Warning: Allowing evaluation lets the agent run any command or access any sensitive data on this origin.
            </div>
          </div>
          
          <div class="aperture-footer">
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
			evalCheckbox.addEventListener("change", () => {
				if (evalCheckbox.checked) {
					warningBox.classList.add("visible");
				} else {
					warningBox.classList.remove("visible");
				}
			});

			const cleanup = () => {
				overlay.classList.remove("active");
				setTimeout(() => {
					overlay.remove();
				}, 300);
			};

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

export function initAperture(options?: { port?: number; serverUrl?: string }) {
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

	const client = new ApertureClient({ serverUrl });
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
