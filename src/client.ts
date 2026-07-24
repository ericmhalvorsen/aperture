import { getToolHandler } from "./client/handlers.js";
import { patchConsole, patchFetch } from "./client/patches.js";
import { storage } from "./client/storage.js";
import {
	injectStyles,
	requestDisplayMedia,
	showApprovalDialog,
	showScreenshotPermissionDialog,
	showStatusDialog,
} from "./client/ui.js";
import type {
	ClientToServerMessage,
	JsonSchema,
	ToolMetadata,
	WSToolCallMessage,
} from "./types.js";
import { isServerToClientMessage } from "./types.js";

declare global {
	interface Window {
		__apertureInstance__: ApertureClient;
		__APERTURE_PORT__: number;
		__APERTURE_URL__: string;
		__vite_inject__: unknown;
	}
}

export interface CustomToolDefinition {
	description: string;
	inputSchema: JsonSchema;
	handler: (
		client: ApertureClient,
		args: Record<string, unknown>,
	) => unknown | Promise<unknown>;
}

export type BadgePosition =
	| "bottom-right"
	| "bottom-left"
	| "top-right"
	| "top-left";

interface BridgeConfig {
	serverUrl: string;
	onApprovalRequest?: (agentName: string) => Promise<{
		approved: boolean;
		capabilities: string[];
		dismissed?: boolean;
	}>;
	customTools?: Record<string, CustomToolDefinition>;
	badgePosition?: BadgePosition;
}

export class ApertureClient {
	private ws: WebSocket | null = null;
	private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
	private config: BridgeConfig;
	private approved = false;
	private denied = false;
	private capabilities: string[] = [];
	private screenCaptureStream: MediaStream | null = null;
	private badgeElement: HTMLElement | null = null;
	private focusListenersAdded = false;

	constructor(config: BridgeConfig) {
		this.config = config;
		window.__apertureInstance__ = this;

		injectStyles();
		patchConsole();
		patchFetch();
		this.loadCachedApproval();
		this.registerKeyboardShortcut();

		if (typeof window !== "undefined") {
			window.addEventListener("beforeunload", () => {
				this.stopScreenCapture();
			});
		}
	}

	private registerKeyboardShortcut() {
		if (typeof document === "undefined") return;
		document.addEventListener("keydown", (e) => {
			const isMac = navigator.platform.toLowerCase().includes("mac");
			const mod = isMac ? e.metaKey : e.ctrlKey;
			if (mod && e.shiftKey && (e.key === "a" || e.key === "A")) {
				e.preventDefault();
				this.openStatusDialog();
			}
		});
	}

	private isBadgeHidden(): boolean {
		const hiddenUntil = storage.get("aperture_badge_hidden_until");
		if (hiddenUntil) {
			return Date.now() < Number(hiddenUntil);
		}
		return false;
	}

	private hideBadgeFor24h() {
		const until = String(Date.now() + 24 * 60 * 60 * 1000);
		storage.set("aperture_badge_hidden_until", until);
		if (this.badgeElement) {
			this.badgeElement.remove();
			this.badgeElement = null;
		}
	}

	private showBadge() {
		storage.remove("aperture_badge_hidden_until");
		const status =
			this.ws?.readyState === WebSocket.OPEN ? "connected" : "connecting";
		this.updateBadge(status);
	}

	private loadCachedApproval() {
		const approved = storage.get("aperture_approved");
		const timestamp = storage.get("aperture_approved_at");
		const storedTtl = storage.get("aperture_ttl_ms");
		const defaultTtlMs = 60 * 60 * 1000;
		const ttlMs = storedTtl ? Number(storedTtl) : defaultTtlMs;

		const isApproved = approved === "true";
		const isStale =
			isApproved && (timestamp ? Date.now() - Number(timestamp) > ttlMs : true);

		if (isApproved && !isStale) {
			this.approved = true;
			this.denied = false;
			let storedCapabilities: unknown;
			try {
				storedCapabilities = JSON.parse(
					storage.get("aperture_capabilities") || "[]",
				);
			} catch {
				storedCapabilities = [];
			}
			if (
				Array.isArray(storedCapabilities) &&
				storedCapabilities.every((value) => typeof value === "string")
			) {
				this.capabilities = storedCapabilities;
			}
		} else if (approved === "false") {
			this.denied = true;
			this.approved = false;
		}

		if (isStale) {
			storage.remove("aperture_approved");
			storage.remove("aperture_approved_at");
			storage.remove("aperture_capabilities");
			storage.remove("aperture_ttl_ms");
		}
	}

	private saveApproval(
		approved: boolean,
		capabilities: string[],
		ttlMs?: number,
	) {
		if (approved) {
			storage.set("aperture_approved", "true");
			storage.set("aperture_approved_at", String(Date.now()));
			storage.set("aperture_capabilities", JSON.stringify(capabilities));
			if (ttlMs) {
				storage.set("aperture_ttl_ms", String(ttlMs));
			}
		} else {
			storage.set("aperture_approved", "false");
			storage.remove("aperture_approved_at");
			storage.remove("aperture_capabilities");
			storage.remove("aperture_ttl_ms");
		}
	}

	private revokeApproval() {
		storage.remove("aperture_approved");
		storage.remove("aperture_approved_at");
		storage.remove("aperture_capabilities");
		storage.remove("aperture_ttl_ms");
		this.approved = false;
		this.denied = false;
		this.capabilities = [];
	}

	connect() {
		if (this.reconnectTimer) {
			clearTimeout(this.reconnectTimer);
			this.reconnectTimer = null;
		}
		const url = new URL("/mcp", this.config.serverUrl);
		url.searchParams.set("type", "browser");

		this.updateBadge("connecting");
		const ws = new WebSocket(url.toString());
		this.ws = ws;

		ws.onopen = () => {
			const customToolsPayload: ToolMetadata[] = this.config.customTools
				? Object.entries(this.config.customTools).map(([name, def]) => ({
						name,
						description: def.description,
						inputSchema: def.inputSchema,
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

			this.reportFocusState();
			if (typeof window !== "undefined" && !this.focusListenersAdded) {
				this.focusListenersAdded = true;
				window.addEventListener("focus", () => this.reportFocusState());
				window.addEventListener("blur", () => this.reportFocusState());
			}
		};

		ws.onmessage = async (event) => {
			try {
				const parsed: unknown = JSON.parse(event.data);
				if (!isServerToClientMessage(parsed)) return;
				const msg = parsed;
				if (msg.type === "tool_call") {
					await this.handleToolCall(msg);
				}
			} catch {}
		};

		ws.onclose = () => {
			if (this.ws !== ws) return;
			this.ws = null;
			this.updateBadge("disconnected");
			this.stopScreenCapture();
			this.reconnectTimer = setTimeout(() => {
				this.reconnectTimer = null;
				this.connect();
			}, 3000);
		};
	}

	disconnect() {
		if (this.reconnectTimer) {
			clearTimeout(this.reconnectTimer);
			this.reconnectTimer = null;
		}
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

	private reportFocusState() {
		if (typeof document === "undefined") return;
		const focused = document.hasFocus();
		this.send({ type: "focus", focused });
	}

	private send(msg: ClientToServerMessage) {
		if (this.ws?.readyState === WebSocket.OPEN) {
			this.ws.send(JSON.stringify(msg));
		}
	}

	private updateBadge(status: "disconnected" | "connecting" | "connected") {
		if (typeof document === "undefined") return;
		if (this.isBadgeHidden()) {
			if (this.badgeElement) {
				this.badgeElement.remove();
				this.badgeElement = null;
			}
			return;
		}
		if (!this.badgeElement) {
			this.badgeElement = document.createElement("div");
			this.badgeElement.id = "aperture-badge";
			this.badgeElement.dataset.position =
				this.config.badgePosition ?? "bottom-right";
			this.badgeElement.title = "Manage Aperture session (Ctrl+Shift+A)";

			const dot = document.createElement("span");
			dot.className = "dot";

			this.badgeElement.appendChild(dot);
			this.badgeElement.addEventListener("click", () => {
				this.openStatusDialog();
			});
			document.body.appendChild(this.badgeElement);
		}

		const dot = this.badgeElement.querySelector(".dot");
		if (dot) {
			dot.className = `dot ${status}`;
		}
	}

	private async handleToolCall(msg: WSToolCallMessage) {
		if (this.denied) {
			this.send({
				type: "result",
				requestId: msg.requestId,
				result: { error: "User denied browser access" },
			});
			return;
		}

		if (!this.approved) {
			await this.getOrWaitApproval();

			if (!this.approved) {
				this.send({
					type: "result",
					requestId: msg.requestId,
					result: {
						error: this.denied
							? "User denied browser access"
							: "User dismissed the approval request",
					},
				});
				return;
			}
		}

		const builtInHandler = getToolHandler(msg.tool);
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

	private approvalPendingPromise: Promise<void> | null = null;

	private getOrWaitApproval(): Promise<void> {
		if (this.approved || this.denied) return Promise.resolve();
		if (this.approvalPendingPromise) return this.approvalPendingPromise;

		this.approvalPendingPromise = (async () => {
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
		})();

		this.approvalPendingPromise.finally(() => {
			this.approvalPendingPromise = null;
		});

		return this.approvalPendingPromise;
	}

	private async getApproval(agentName: string): Promise<{
		approved: boolean;
		capabilities: string[];
		ttlMs?: number;
		dismissed?: boolean;
	}> {
		if (this.config.onApprovalRequest) {
			const result = await this.config.onApprovalRequest(agentName);
			return { ...result, dismissed: false };
		}
		return showApprovalDialog(agentName);
	}

	async captureScreenshotFromStream(selector?: string): Promise<string> {
		const cropElement = selector ? document.querySelector(selector) : undefined;
		if (selector && !cropElement) {
			throw new Error(`Element not found matching selector: ${selector}`);
		}
		const cropRect = cropElement?.getBoundingClientRect();
		if (!this.screenCaptureStream?.active) {
			if (!this.approved || !this.capabilities.includes("screenshot")) {
				throw new Error(
					"Screenshot access was not granted. Please approve the connection with screenshot capability enabled.",
				);
			}
			const stream = await this.requestScreenCapture();
			if (!stream) {
				throw new Error(
					"Failed to acquire screen capture. Please try again or re-approve the connection.",
				);
			}
			this.screenCaptureStream = stream;
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

		await video.play().catch(() => null);

		await new Promise<void>((resolve) => {
			if (typeof video.requestVideoFrameCallback === "function") {
				video.requestVideoFrameCallback(() => resolve());
				setTimeout(() => resolve(), 1000);
			} else {
				setTimeout(() => resolve(), 300);
			}
		});

		const videoWidth = video.videoWidth || 800;
		const videoHeight = video.videoHeight || 600;
		const viewportWidth = window.innerWidth || videoWidth;
		const viewportHeight = window.innerHeight || videoHeight;
		const source = cropRect
			? {
					left: Math.max(0, cropRect.left),
					top: Math.max(0, cropRect.top),
					right: Math.min(viewportWidth, cropRect.right),
					bottom: Math.min(viewportHeight, cropRect.bottom),
				}
			: { left: 0, top: 0, right: viewportWidth, bottom: viewportHeight };
		if (source.right <= source.left || source.bottom <= source.top) {
			throw new Error(`Element is outside the viewport: ${selector}`);
		}
		const scaleX = videoWidth / viewportWidth;
		const scaleY = videoHeight / viewportHeight;
		const sourceX = source.left * scaleX;
		const sourceY = source.top * scaleY;
		const sourceWidth = (source.right - source.left) * scaleX;
		const sourceHeight = (source.bottom - source.top) * scaleY;
		const canvas = document.createElement("canvas");
		canvas.width = Math.max(1, Math.round(sourceWidth));
		canvas.height = Math.max(1, Math.round(sourceHeight));
		const ctx = canvas.getContext("2d");
		if (!ctx) {
			throw new Error("Could not get 2D context from canvas");
		}
		ctx.drawImage(
			video,
			sourceX,
			sourceY,
			sourceWidth,
			sourceHeight,
			0,
			0,
			canvas.width,
			canvas.height,
		);
		const dataUrl = canvas.toDataURL("image/png");

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

	private async requestScreenCapture(): Promise<MediaStream | null> {
		const result = await requestDisplayMedia();
		if (result.stream) return result.stream;

		if (result.needsGesture) {
			return await showScreenshotPermissionDialog();
		}

		console.warn("[Aperture] Screen capture failed or denied:", result.error);
		return null;
	}

	private openStatusDialog() {
		showStatusDialog({
			wsReadyState: this.ws?.readyState ?? WebSocket.CLOSED,
			approved: this.approved,
			denied: this.denied,
			capabilities: this.capabilities,
			isBadgeHidden: () => this.isBadgeHidden(),
			showBadge: () => this.showBadge(),
			hideBadgeFor24h: () => this.hideBadgeFor24h(),
			revokeApproval: () => this.revokeApproval(),
			onApprovalStateChange: (state) => {
				this.approved = state.approved;
				this.denied = state.denied ?? !state.approved;
				this.capabilities = state.capabilities;
				if (state.stream !== undefined) {
					if (state.stream === null) {
						this.stopScreenCapture();
					} else {
						this.screenCaptureStream = state.stream;
					}
				}
				this.saveApproval(this.approved, this.capabilities);
				this.send({
					type: "approval",
					approved: this.approved,
					capabilities: this.capabilities,
				});
			},
		});
	}
}

export function initAperture(options?: {
	port?: number;
	serverUrl?: string;
	customTools?: Record<string, CustomToolDefinition>;
	badgePosition?: BadgePosition;
}) {
	if (typeof window === "undefined") return;

	const isDev =
		location.hostname === "localhost" ||
		location.hostname === "127.0.0.1" ||
		location.hostname.endsWith(".localhost") ||
		!!window.__vite_inject__;

	if (!isDev) return;

	const port = options?.port || window.__APERTURE_PORT__ || 3456;
	const serverUrl = options?.serverUrl || `ws://localhost:${port}`;

	const existing = window.__apertureInstance__;
	if (existing && typeof existing.disconnect === "function") {
		existing.disconnect();
	}

	const client = new ApertureClient({
		serverUrl,
		customTools: options?.customTools,
		badgePosition: options?.badgePosition,
	});
	client.connect();
	window.__apertureInstance__ = client;
	return client;
}

if (typeof window !== "undefined") {
	const isDev =
		location.hostname === "localhost" ||
		location.hostname === "127.0.0.1" ||
		location.hostname.endsWith(".localhost") ||
		!!window.__vite_inject__;

	if (isDev) {
		setTimeout(() => {
			if (!window.__apertureInstance__) {
				const port = window.__APERTURE_PORT__ || 3456;
				const serverUrl = window.__APERTURE_URL__ || `ws://localhost:${port}`;
				console.log(
					"[Aperture] No manual initialization detected. Auto-connecting...",
				);
				const client = new ApertureClient({ serverUrl });
				client.connect();
				window.__apertureInstance__ = client;
			}
		}, 500);
	}
}
