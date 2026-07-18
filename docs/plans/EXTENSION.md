# Chrome Extension Plan

## Goal

Enable Aperture to work on **any website** without code changes, while keeping the current stack-integrated approach for projects that want deep integration.

Two deployment models:
1. **Stack mode** (current): Server starts as dev sidecar, client injected via `<Aperture />` or script tag
2. **Extension mode** (new): Extension auto-injects client + auto-approves, works on any site

## Architecture

### Phase 1: Lightweight Extension (Current Plan)

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
**Cons**: Still requires separate server process (but this is already solved by stack plugins)

### Alternative: Native Messaging Host (Future Consideration)

```
Browser Tab ←content script / chrome.debugger→ Chrome Extension ←native messaging→ Native Host ←stdio→ Agent
```

- Extension IS the bridge (no separate server)
- Native messaging host is spawned by the agent (like current `stdin` mode)
- Extension uses `chrome.debugger` for console/network/screenshots
- Content scripts handle all tool execution

**Pros**: Zero infrastructure, install extension and go, single process
**Cons**: chrome.debugger shows "debugging" bar, ~2-3 weeks, per-agent native host setup, more complex

**Why not doing this now**: The server startup problem is already solved by the fact that the MCP harness can start the server via stdio. The lightweight extension gives us "works on any site" without the complexity of native messaging.

## Implementation Plan

### Phase 1: Lightweight Extension — ~1 week

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

### Phase 2: Polish — ~1 week

- Extension icon in Chrome Web Store
- Popup UI with connection status, session management
- Per-site settings (auto-approve vs. manual approval)

## Server Startup: Stack vs. Harness

| | Stack Mode | Extension Mode |
|---|---|---|
| **Who starts server** | `pnpm dev` (via plugin) | Any MCP harness (spawn process) |
| **Lifecycle** | Tied to dev session | Tied to agent session |
| **Setup** | Add to config + add `<Aperture />` | Install extension |
| **Code changes** | Yes (per project) | None |
| **Works on any site** | No | Yes |
| **Console/network capture** | patchConsole/patchFetch | Same (page injection) |
| **Screenshots** | getDisplayMedia (user picks tab) | getDisplayMedia (user picks tab) |
| **Best for** | Projects you own | Any site, quick debugging |

**Both modes share the same MCP tools and agent config**. The difference is purely in how the browser bridge is bootstrapped.

## Effort Estimate

| Phase | Effort | Value |
|-------|--------|-------|
| Phase 1: Lightweight extension | 3-5 days | Works on any site |
| Phase 2: Polish | 1 week | Web Store, popup UI, settings |

## Open Questions

1. **Scope of auto-approve**: Should the extension auto-approve on ALL sites or only localhost? Defaulting to localhost-only is safer.
2. **Custom tools**: The current stack mode supports custom tools registered by the app. Extension mode wouldn't have this. Is that acceptable?
3. **Distribution**: Chrome Web Store ($5 one-time fee) vs. unpacked developer mode. Web Store is better for adoption.
