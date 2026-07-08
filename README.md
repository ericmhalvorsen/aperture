# @ericmhalvorsen/aperture

> Let Agent see browser. Agent build better stuff. Perchance

No extensions. No CORS hacks. Auto-connect your local dev browser to Claude Code, Cursor, OpenCode, or any other MCP-capable agent.

## 5-Minute Quickstart

### 1. Install

```bash
npm install -D @ericmhalvorsen/aperture
```

### 2. Add to your app

**Next.js:**
```ts
// next.config.ts
import { withAperture } from "@ericmhalvorsen/aperture/next";

export default withAperture({
  // your existing config
});
```

**Vite:**
```ts
// vite.config.ts
import { aperture } from "@ericmhalvorsen/aperture/vite";

export default {
  plugins: [aperture()],
};
```

**Other frameworks:**
```bash
# Run in a separate terminal
npx @ericmhalvorsen/aperture
```

### 3. Add the client

**React/Next.js:**
```tsx
import { Aperture } from "@ericmhalvorsen/aperture/react";

export default function RootLayout({ children }) {
  return (
    <html>
      <body>
        {children}
        {process.env.NODE_ENV === "development" && <Aperture />}
      </body>
    </html>
  );
}
```

**Vite/Vanilla:**
```typescript
// In your main entry file
import "@ericmhalvorsen/aperture/register";
```

**No bundler:**
```html
<script src="http://localhost:3456/aperture.js"></script>
```

### 4. Start your dev server

```bash
npm run dev
```

You should see:
- A green dot badge in the bottom-right of your page
- Console output: `[Aperture] Server running on port 3456`

### 5. Connect your agent

Add to your agent's MCP config:

```json
{
  "mcpServers": {
    "aperture": {
      "url": "http://localhost:3456/sse"
    }
  }
}
```

When the agent makes its first request, you'll see an approval dialog in your browser. Click "Allow" to grant access.

### What's next?

- **Try the example app:** `pnpm run example` from this repo
- **Learn more:** Check out the [Architecture](#architecture) and [Security Model](#security-model) sections
- **Debug issues:** See the [Debugging](#debugging) section

---

## How It Works

```
┌─────────────────┐      WebSocket       ┌──────────────────┐
│   Browser Tab   │ ←──────────────────→ │  Aperture Server │
│  (<Aperture />) │   (dev sidecar)      │   (port 3456)    │
└─────────────────┘                      └──────────────────┘
                                                 │
                                                 │ SSE / HTTP
                                                 │ (MCP remote)
                                                 ↓
                                         ┌──────────────────┐
                                         │   MCP Client     │
                                         │  (OpenCode, etc) │
                                         └──────────────────┘
```

1. **Your app starts the Aperture server** as a dev sidecar (via `withAperture()`, Vite plugin, or manual)
2. **The browser connects** via WebSocket when `<Aperture />` mounts
3. **The agent connects** via SSE over HTTP to the already-running server
4. **You approve** the first request per session — deny blocks the agent entirely

## MCP Capabilities

| Tool | Action | Requires |
|------|--------|----------|
| `browser_list_sessions` | List connected tabs with metadata | Nothing |
| `browser_dom_query` | CSS query DOM elements | Approval |
| `browser_page_info` | Page metadata + console logs | Approval |
| `browser_network_requests` | Audit fetch/XHR history | Approval |
| `browser_storage_get` | Read localStorage or cookies | Approval |
| `browser_click` | Fire click events | Approval |
| `browser_type` | Type into inputs | Approval |
| `browser_scroll` | Scroll page or element | Approval |
| `browser_screenshot` | Capture viewport | Screenshot checkbox + approval modal if stream inactive |
| `browser_evaluate` | Run arbitrary JS | Evaluate checkbox |

### Screenshot Tool

`browser_screenshot` requires a live screen capture stream from the browser. If the stream is inactive (e.g. after a page refresh), the approval modal will appear in the browser tab. Ask the user to click **Allow** — the modal will re-request `getDisplayMedia()` and the screenshot will proceed.

### Multi-Session Support

If multiple browser tabs are connected, the agent must choose one:

1. Call `browser_list_sessions` → get `sessionId`, `url`, `title` for each tab
2. Pass `sessionId` in subsequent tool calls:
   ```json
   { "name": "browser_screenshot", "arguments": { "sessionId": "abc-123" } }
   ```

If only one tab is connected, `sessionId` is optional (auto-selected based on most recent activity).

---

## Security Model

- **Dev Only**: The client only initializes on `localhost` or `127.0.0.1`.
- **Localhost Only**: The server binds to `127.0.0.1`. No external traffic.
- **One-click Consent**: First tool call spawns an explicit dialog. Deny = blocked for the session.
- **Conditional Persistence**: Approval persists across page reloads for **1 hour** by default. Check "Trust this device for 24 hours" in the dialog to extend to 24h. Click "Revoke Session" to clear early.
- **Opt-in Risk**: Screenshots and JS evaluation are enabled by default in the approval dialog but require explicit user consent via the modal.

---

## Architecture

```
Your App (or any framework)
├── next.config.ts  → withAperture()   → starts server on port 3456
├── app/layout.tsx  → <Aperture />     → browser connects via WebSocket
│
└── Agent (opencode, Claude Code, etc.)
    └── SSE connection to http://localhost:3456/sse
```

The server is a **dev sidecar** owned by your app. The agent is a **client** that connects to it via SSE. This means:
- One `pnpm dev` starts everything
- No "server not running" errors from the agent
- The server lifecycle matches your app, not the agent
- No stdio bridge process to manage or restart

---

## Debugging

If you're integrating Aperture with a new MCP client or framework and need to see the raw HTTP/SSE traffic (e.g. to diagnose session timeouts or URL resolution issues):

- **Standalone Mode**: Run with the verbose flag: `npx @ericmhalvorsen/aperture -v` or `aperture -v`.
- **Sidecar Mode**: The server logs basic HTTP requests (`[Aperture HTTP] GET /sse`) and session connect/disconnect events to stderr. When spawned via a framework plugin (like Next.js or Vite), these logs are inherited by the parent process so you can view them directly in your dev server terminal.

---

## Local Development

```bash
# Install
pnpm install

# Watch compilation
pnpm dev

# Build
pnpm build

# Lint & format
pnpm run check
pnpm run format
```

### Link for local testing

```bash
# In the aperture directory:
pnpm link --global

# In your test project:
pnpm link --global @ericmhalvorsen/aperture
```

After editing Aperture source, run `pnpm build` in the aperture directory. The consuming project (linked) will pick up the changes on restart.

---

## License

MIT
