# Chrome Extension Plan

## Goal

Enable Aperture to work on **any website** without code changes, while keeping the current stack-integrated approach for projects that want deep integration.

Two deployment models:
1. **Stack mode** (current): Server starts as dev sidecar, client injected via `<Aperture />` or script tag
2. **Extension mode** (new): Extension auto-injects client + auto-approves, works on any site

## Architecture Options

### Option A: Extension + Existing Server (Lightweight)

```
Browser Tab ←content script injects client→ Aperture Server ←SSE→ Agent
                ↑
         Extension auto-approves
```

- Extension injects the existing client script into every page
- Extension auto-approves tool calls (skips the dialog)
- Server still runs separately (via `npx @ericmhalvorsen/aperture` or stack plugin)
- Agent config unchanged (connects to `http://localhost:3456/sse`)

**Pros**: Minimal new code, reuses everything, ~3-5 days to build
**Cons**: Still requires separate server process

### Option B: Extension + Native Messaging Host (Full Replacement)

```
Browser Tab ←content script / chrome.debugger→ Chrome Extension ←native messaging→ Native Host ←stdio→ Agent
```

- Extension IS the bridge (no separate server)
- Native messaging host is spawned by the agent (like current `stdin` mode)
- Extension uses `chrome.debugger` for console/network/screenshots
- Content scripts for DOM queries, click, type, scroll

**Pros**: Zero infrastructure, install extension and go, single process
**Cons**: chrome.debugger shows "debugging" bar, ~2-3 weeks, per-agent native host setup

### Option C: Extension as Server (Hybrid)

```
Browser Tab ←content script→ Chrome Extension (background = MCP server) ←native messaging→ Agent
```

- Extension background script implements MCP protocol directly
- Native messaging host is a thin shim (just relays between agent and extension)
- Content scripts handle all tool execution
- No `chrome.debugger` needed (content scripts + page injection for console/network)

**Pros**: No debugging bar, no separate server, clean architecture
**Cons**: Content scripts can't capture console/network without page injection (need to patch console/fetch from within the page context), ~2 weeks

## Recommendation

**Start with Option A**, then graduate to Option C.

Option A gets us to "works on any site" in days, not weeks. It validates the extension UX without committing to a full rewrite. The native messaging host for Option C can be added later as a non-breaking enhancement — the agent config just changes from SSE to stdio.

## Implementation Plan

### Phase 1: Lightweight Extension (Option A) — ~1 week

**Deliverable**: Chrome extension that auto-injects the Aperture client and auto-approves on any site.

#### File structure
```
extension/
├── manifest.json
├── background.js        # Service worker: manages state, badge icon
├── content.js           # Injected into every page: auto-approves
├── inject.js            # Injected into page context: runs client code
├── popup.html           # Extension popup: status, settings
├── popup.js
└── icons/
    ├── icon16.png
    ├── icon48.png
    └── icon128.png
```

#### manifest.json
```json
{
  "manifest_version": 3,
  "name": "Aperture Agent Bridge",
  "version": "0.1.0",
  "description": "Auto-connect your browser to MCP-capable AI agents",
  "permissions": ["storage", "activeTab"],
  "host_permissions": ["<all_urls>"],
  "background": {
    "service_worker": "background.js"
  },
  "content_scripts": [{
    "matches": ["http://localhost/*", "https://localhost/*"],
    "js": ["content.js"],
    "run_at": "document_start"
  }],
  "action": {
    "default_popup": "popup.html",
    "default_icon": "icon48.png"
  },
  "web_accessible_resources": [{
    "resources": ["inject.js", "dist-browser/client.js"],
    "matches": ["<all_urls>"]
  }]
}
```

#### Auto-approve mechanism

The content script injects a flag into the page context BEFORE the client loads:

```js
// content.js — runs in isolated world, injects into page context
const script = document.createElement("script");
script.textContent = `window.__APERTURE_AUTO_APPROVE__ = true;`;
document.documentElement.appendChild(script);
script.remove();

// Then inject the client
const clientScript = document.createElement("script");
clientScript.src = chrome.runtime.getURL("dist-browser/client.js");
document.documentElement.appendChild(clientScript);
```

Client-side change needed in `src/client.ts`:

```ts
private getOrWaitApproval(): Promise<void> {
  if (this.approved || this.denied) return Promise.resolve();
  if ((window as any).__APERTURE_AUTO_APPROVE__) {
    this.approved = true;
    this.capabilities = ["console", "dom", "network", "storage", "screenshot", "evaluate"];
    this.send({ type: "approval", approved: true, capabilities: this.capabilities });
    return Promise.resolve();
  }
  // ... existing dialog flow
}
```

#### Server startup question

The extension needs the server running. Two sub-options:

**A1: User runs server manually**
```bash
npx @ericmhalvorsen/aperture
```
Extension connects to localhost:3456 automatically. Simplest approach.

**A2: Extension starts server via native messaging host**
A small native host binary that:
1. Is spawned by the extension
2. Starts the Aperture server
3. Relays messages between extension and server

This removes the "run a command" step but requires native host installation.

**Recommendation**: Start with A1. Add A2 in Phase 2 if the friction is too much.

#### Client changes needed

1. Add `__APERTURE_AUTO_APPROVE__` check (above)
2. Add `__APERTURE_HIDE_BADGE__` flag (extension popup replaces the badge)
3. Add `__APERTURE_SERVER_URL__` override (so extension can configure the server URL)

These are ~10 lines of changes to `src/client.ts`.

#### Testing

- Load extension in Chrome (developer mode)
- Visit any localhost page
- Verify auto-connection and auto-approval
- Test with an MCP client (OpenCode/Claude Code)

### Phase 2: Native Messaging Host (Option C) — ~2 weeks

**Deliverable**: Extension + native host that replaces the server entirely.

#### Architecture
```
Agent ←stdio→ native-host (node binary) ←native messaging→ extension ←content scripts→ tabs
```

#### Native messaging host
- Small Node.js binary (`aperture-native-host`)
- Spawned by the agent via MCP config:
  ```json
  {
    "mcpServers": {
      "aperture": {
        "command": "npx",
        "args": ["-y", "@ericmhalvorsen/aperture/native-host"]
      }
    }
  }
  ```
- Communicates with extension via chrome.runtime.sendNativeMessage
- Implements MCP protocol on stdio (reuses existing `McpServer` + `StdioServerTransport`)

#### Extension changes
- Background script implements tool routing (replaces server logic)
- Content scripts handle tool execution (reuses existing `TOOL_HANDLERS`)
- Console/network capture via page-context injection (existing `patchConsole`/`patchFetch`)
- Screenshots via `chrome.tabs.captureVisibleTab()` (no getDisplayMedia needed)

#### Key advantage
- No `chrome.debugger` = no debugging bar
- No separate server process
- Works on any site, any port, no configuration

### Phase 3: Polish — ~1 week

- Extension icon in Chrome Web Store
- Popup UI with connection status, session management
- Per-site settings (auto-approve vs. manual approval)
- Firefox support (manifest v3 is cross-browser now)

## Server Startup: Stack vs. Harness

| | Stack Mode | Extension Mode |
|---|---|---|
| **Who starts server** | `pnpm dev` (via plugin) | Native messaging host (spawned by agent) |
| **Lifecycle** | Tied to dev session | Tied to agent session |
| **Setup** | Add to config + add `<Aperture />` | Install extension |
| **Code changes** | Yes (per project) | None |
| **Works on any site** | No | Yes |
| **Console/network capture** | patchConsole/patchFetch | Same (page injection) or chrome.debugger |
| **Screenshots** | getDisplayMedia (user picks tab) | chrome.tabs.captureVisibleTab (no prompt) |
| **Best for** | Projects you own | Any site, quick debugging |

**Both modes share the same MCP tools and agent config** (once native host is built). The difference is purely in how the browser bridge is bootstrapped.

## Effort Estimate

| Phase | Effort | Value |
|-------|--------|-------|
| Phase 1: Lightweight extension | 3-5 days | Works on any site (with server) |
| Phase 2: Native messaging host | 1-2 weeks | No server needed, full replacement |
| Phase 3: Polish | 1 week | Web Store, popup UI, Firefox |

## Open Questions

1. **Scope of auto-approve**: Should the extension auto-approve on ALL sites or only localhost? Defaulting to localhost-only is safer.
2. **Screenshot approach**: `chrome.tabs.captureVisibleTab()` (extension API, no prompt) vs. `getDisplayMedia()` (current, requires user prompt). Extension API is better UX.
3. **Network capture fidelity**: `patchFetch` captures fetch() only. `chrome.debugger` captures everything but shows the debugging bar. `chrome.webRequest` captures requests but not response bodies. What's the right tradeoff?
4. **Custom tools**: The current stack mode supports custom tools registered by the app. Extension mode wouldn't have this. Is that acceptable?
5. **Distribution**: Chrome Web Store ($5 one-time fee) vs. unpacked developer mode. Web Store is better for adoption.
