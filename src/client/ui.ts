export function injectStyles() {
	if (typeof document === "undefined") return;
	const styleId = "aperture-styles";
	if (document.getElementById(styleId)) return;
	const style = document.createElement("style");
	style.id = styleId;
	style.textContent = `
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
      display: block;
      font-size: 13px;
      color: var(--ap-text-secondary);
      margin-bottom: 20px;
    }

    #aperture-dialog .aperture-list {
      display: block;
      margin: 12px 0 0 24px;
      padding: 0;
      color: var(--ap-text-secondary);
      list-style-type: disc;
    }

    #aperture-dialog .aperture-list li {
      display: list-item;
      color: inherit;
      margin-bottom: 6px;
      font-size: 13px;
      line-height: 1.4;
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
      appearance: auto;
      -webkit-appearance: checkbox;
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
      display: inline-block;
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

import { html, render } from "lit-html";

function createDialogOverlay(onDismiss?: () => void) {
	const overlay = document.createElement("div");
	overlay.id = "aperture-dialog-overlay";
	document.body.appendChild(overlay);

	const cleanup = () => {
		overlay.classList.remove("active");
		setTimeout(() => {
			overlay.remove();
		}, 300);
		document.removeEventListener("keydown", escHandler);
	};

	const escHandler = (e: KeyboardEvent) => {
		if (e.key === "Escape") {
			cleanup();
			onDismiss?.();
		}
	};
	document.addEventListener("keydown", escHandler);

	const outsideClickHandler = (e: MouseEvent) => {
		if (e.target === overlay) {
			cleanup();
			onDismiss?.();
		}
	};
	overlay.addEventListener("click", outsideClickHandler);

	const activate = () => {
		setTimeout(() => {
			overlay.classList.add("active");
		}, 10);
	};

	return { overlay, cleanup, activate };
}

export async function requestDisplayMedia(): Promise<MediaStream | null> {
	try {
		return await navigator.mediaDevices.getDisplayMedia({
			video: { displaySurface: "browser" },
			audio: false,
		} as { video: { displaySurface: string }; audio: false });
	} catch (err) {
		console.warn(
			"[Aperture] Failed to acquire screen share stream for screenshots:",
			err,
		);
		return null;
	}
}

export function showApprovalDialog(
	agentName: string,
	onApprovalStateChange: (state: {
		stream?: MediaStream | null;
		capabilities?: string[];
	}) => void,
): Promise<{
	approved: boolean;
	capabilities: string[];
	ttlMs?: number;
	dismissed?: boolean;
}> {
	return new Promise((resolve) => {
		if (typeof document === "undefined") {
			resolve({ approved: false, capabilities: [] });
			return;
		}

		const { overlay, cleanup, activate } = createDialogOverlay(() => {
			resolve({ approved: false, capabilities: [], dismissed: true });
		});

		let allowScreenshot = true;
		let allowEval = true;
		let remember24h = true;

		const handleDismiss = () => {
			cleanup();
			resolve({ approved: false, capabilities: [], dismissed: true });
		};

		const handleDeny = () => {
			cleanup();
			resolve({ approved: false, capabilities: [] });
		};

		const handleAllow = async () => {
			const ttlMs = remember24h ? 24 * 60 * 60 * 1000 : 60 * 60 * 1000;
			const capabilities = ["console", "dom", "network", "storage"];
			if (allowEval) capabilities.push("evaluate");

			if (allowScreenshot) {
				const stream = await requestDisplayMedia();
				if (stream) {
					onApprovalStateChange({ stream });
					capabilities.push("screenshot");
				}
			}

			cleanup();
			resolve({ approved: true, capabilities, ttlMs });
		};

		const renderDialog = () => {
			const template = html`
				<div id="aperture-dialog">
					<div class="aperture-header">
						<div class="aperture-icon">🔌</div>
						<div class="aperture-title-container">
							<h3 class="aperture-title">Agent Bridge</h3>
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
							${allowScreenshot ? html`<li id="aperture-perm-screenshot">Capture screenshots of the page</li>` : ""}
							${allowEval ? html`<li id="aperture-perm-eval">Execute arbitrary JavaScript in this page</li>` : ""}
						</ul>
					</div>

					<div class="aperture-options">
						<label class="aperture-checkbox-label">
							<input
								type="checkbox"
								id="aperture-allow-screenshot"
								.checked=${allowScreenshot}
								@change=${(e: Event) => {
									allowScreenshot = (e.target as HTMLInputElement).checked;
								}}
							/>
							<div>
								<strong>Allow screenshot capture</strong>
								<div class="aperture-checkbox-desc">Requests browser tab/screen sharing for live views</div>
							</div>
						</label>

						<label class="aperture-checkbox-label">
							<input
								type="checkbox"
								id="aperture-allow-eval"
								.checked=${allowEval}
								@change=${(e: Event) => {
									allowEval = (e.target as HTMLInputElement).checked;
								}}
							/>
							<div>
								<strong>Allow JavaScript evaluation</strong>
								<div class="aperture-checkbox-desc">Enables arbitrary JS execution in this page (dangerous)</div>
							</div>
						</label>

						<label class="aperture-checkbox-label">
							<input
								type="checkbox"
								id="aperture-remember-24h"
								.checked=${remember24h}
								@change=${(e: Event) => {
									remember24h = (e.target as HTMLInputElement).checked;
								}}
							/>
							<div>
								<strong>Trust this device for 24 hours</strong>
								<div class="aperture-checkbox-desc">Otherwise approval resets after 1 hour</div>
							</div>
						</label>

						<div id="aperture-eval-warning" class="aperture-warning-box ${allowEval ? "visible" : ""}">
							⚠️ Warning: Allowing evaluation lets the agent run any command or access any sensitive data on this origin.
						</div>
					</div>

					<div class="aperture-footer">
						<button id="aperture-btn-dismiss" class="aperture-btn aperture-btn-deny" @click=${handleDismiss}>Dismiss</button>
						<button id="aperture-btn-deny" class="aperture-btn aperture-btn-deny" @click=${handleDeny}>Deny</button>
						<button id="aperture-btn-allow" class="aperture-btn aperture-btn-allow" @click=${handleAllow}>Allow for this session</button>
					</div>
				</div>
			`;
			render(template, overlay);
		};

		renderDialog();
		activate();
	});
}

export function showStatusDialog(options: {
	wsReadyState: number;
	approved: boolean;
	denied: boolean;
	capabilities: string[];
	isBadgeHidden: () => boolean;
	showBadge: () => void;
	hideBadgeFor24h: () => void;
	revokeApproval: () => void;
	onApprovalStateChange: (state: {
		approved: boolean;
		capabilities: string[];
		stream?: MediaStream | null;
	}) => void;
}) {
	if (typeof document === "undefined") return;
	if (document.getElementById("aperture-dialog-overlay")) return;

	const { overlay, cleanup } = createDialogOverlay();

	const isMac = navigator.platform.toLowerCase().includes("mac");
	const shortcut = isMac ? "Cmd+Shift+A" : "Ctrl+Shift+A";

	const handleClose = () => cleanup();

	const handleRevoke = () => {
		options.revokeApproval();
		options.onApprovalStateChange({
			approved: false,
			capabilities: [],
			stream: null,
		});
		cleanup();
	};

	const handleHideBadge = () => {
		if (options.isBadgeHidden()) {
			options.showBadge();
		} else {
			options.hideBadgeFor24h();
		}
		cleanup();
	};

	const renderDialog = () => {
		const connectionStatus =
			options.wsReadyState === WebSocket.OPEN ? "Connected" : "Disconnected";
		const sessionStatus = options.denied
			? "Denied"
			: options.approved
				? "Approved"
				: "Pending Approval";

		const hasScreenshot = options.capabilities.includes("screenshot");
		const hasEval = options.capabilities.includes("evaluate");
		const badgeHidden = options.isBadgeHidden();
		const hideButtonText = badgeHidden
			? "Show badge"
			: "Hide badge for 24 hours";

		const template = html`
			<div id="aperture-dialog">
				<div class="aperture-header">
					<div class="aperture-icon">⚙️</div>
					<div class="aperture-title-container">
						<h3 class="aperture-title">Agent Bridge</h3>
						<p class="aperture-subtitle">${options.approved ? "Session active" : "Waiting for approval"}</p>
					</div>
				</div>

				<div class="aperture-body">
					<div style="margin-bottom: 12px; display: flex; justify-content: space-between; font-size: 13px;">
						<span>Connection:</span>
						<strong style="color: ${connectionStatus === "Connected" ? "#10b981" : "#ef4444"};">${connectionStatus}</strong>
					</div>
					<div style="margin-bottom: 12px; display: flex; justify-content: space-between; font-size: 13px;">
						<span>Status:</span>
						<strong style="color: ${sessionStatus === "Approved" ? "#10b981" : sessionStatus === "Denied" ? "#ef4444" : "#f59e0b"};">${sessionStatus}</strong>
					</div>

					${options.approved ? html`
						<div style="margin-top: 16px; padding-top: 12px; border-top: 1px solid var(--ap-border);">
							<div style="font-size: 12px; color: var(--ap-text-muted); margin-bottom: 8px;">Enabled capabilities:</div>
							<ul style="font-size: 13px; margin: 0; padding-left: 20px; color: var(--ap-text);">
								<li>Console logs</li>
								<li>DOM queries</li>
								<li>Network requests</li>
								<li>Storage access</li>
								${hasScreenshot ? html`<li>Screenshots</li>` : ""}
								${hasEval ? html`<li>JavaScript evaluation</li>` : ""}
							</ul>
						</div>
					` : ""}
				</div>

				<div class="aperture-footer">
					${
						options.approved
							? html`
									<button id="aperture-status-btn-revoke" class="aperture-btn aperture-btn-deny" @click=${handleRevoke}>Revoke</button>
									<button id="aperture-status-btn-close" class="aperture-btn aperture-btn-allow" @click=${handleClose}>Close</button>
							  `
							: html`
									<div style="width: 100%; text-align: center; color: var(--ap-text-muted); font-size: 13px;">
										Waiting for agent connection...
									</div>
							  `
					}
				</div>

				<div style="margin-top: 16px; padding-top: 14px; border-top: 1px solid var(--ap-border); text-align: center;">
					<button id="aperture-status-btn-hide" class="aperture-btn aperture-btn-deny" style="width: 100%;" @click=${handleHideBadge}>${hideButtonText}</button>
					<div style="margin-top: 8px; font-size: 11px; color: var(--ap-text-muted);">
						Re-open with <kbd style="font-family: monospace; background: var(--ap-btn-deny-bg); border: 1px solid var(--ap-btn-deny-border); border-radius: 4px; padding: 1px 4px; font-size: 10px;">${shortcut}</kbd>
					</div>
				</div>
			</div>
		`;
		render(template, overlay);
	};

	renderDialog();
	setTimeout(() => {
		overlay.classList.add("active");
	}, 10);
}
