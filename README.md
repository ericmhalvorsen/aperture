# @ericmhalvorsen/aperture

> Give MCP-capable AI agents a live view into your local dev session.

No extensions. No CORS hacks. Auto-connect your local dev browser to Claude Code, Cursor, OpenCode, or any other MCP-capable agent. The agent can tail console logs, query the DOM, inspect network requests, scroll, click, type, and evaluate JS — after you approve it with a single click.

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

## Installation

```bash
npm install -D @ericmhalvorsen/aperture
```

## Try It Out

We've included a barebones Next.js sample app with Aperture (and a custom tool) pre-configured. You can run it with a single command from this repository:

```bash
pnpm install
pnpm run example
```

Then visit `http://localhost:3000` to see the Aperture badge, and connect your favorite MCP client!

## Quick Start

### 1. Start the Server (Dev Sidecar)

#### Next.js
```ts
// next.config.ts
import { withAperture } from "@ericmhalvorsen/aperture/next";

export default withAperture({
  // your existing Next.js config
});
```
`pnpm dev` now starts both Next.js and Aperture automatically.

#### Vite
```ts
// vite.config.ts
import { aperture } from "@ericmhalvorsen/aperture/vite";

export default {
  plugins: [aperture(), /* your other plugins */],
};
```
`vite dev` now starts both Vite and Aperture automatically.

#### Manual / Other Frameworks
```bash
# In a separate terminal, or from your dev script
npx @ericmhalvorsen/aperture
# or with a custom port
APERTURE_PORT=5678 npx @ericmhalvorsen/aperture
```

### 2. Load the Browser Client

#### React / Next.js (Recommended)
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

#### Self-Registering Import (Vite, webpack, etc.)
```typescript
import "@ericmhalvorsen/aperture/register";
```
Imports once in your browser entry point. Auto-initializes on `localhost`.

#### Manual Initialization
```typescript
import { initAperture } from "@ericmhalvorsen/aperture/client";
initAperture({ port: 3456 });
```

#### Standalone Script (no bundler)
```html
<script src="http://localhost:3456/aperture.js"></script>
```

The client will:
- Render a connection status badge in the bottom-right
- Listen for incoming agent connections on `ws://localhost:3456`
- Trigger a glassmorphic authorization modal on the first agent request
- Track focus/blur to determine which tab the agent should interact with

### 3. Configure Your Agent

You can connect your agent to Aperture using one of two modes:

#### Option A: SSE Remote Mode (Recommended for Sidecar Setup)

If Aperture is running as a sidecar inside your Vite/Next.js app, configure your agent to connect directly to the already-running server's SSE endpoint:

```json
{
  "mcpServers": {
    "aperture": {
      "url": "http://localhost:3456/sse"
    }
  }
}
```

The client connects to `http://localhost:3456/sse`, receives an `endpoint` event, and POSTs JSON-RPC messages to the returned `/messages?sessionId=...` URL.

#### Option B: Standalone Stdio Mode (If Not Using Vite/Next.js Plugin)

If you aren't integrating as a sidecar with a web server, you can configure your agent to spawn the Aperture server standalone over `stdin/stdout`. In this mode, the agent starts the Aperture server, which hosts the WebSocket bridge on port 3456 for your browser tab to connect to:

```json
{
  "mcpServers": {
    "aperture": {
      "command": "npx",
      "args": ["-y", "@ericmhalvorsen/aperture", "stdin"]
    }
  }
}
```

---

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

`browser_screenshot` requires a live screen capture stream from the browser. If the stream is inactive (e.g. after a page refresh), the Aperture approval modal will appear in the browser tab. Ask the user to click **Allow** — the modal will re-request `getDisplayMedia()` and the screenshot will proceed.

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

- **Dev Only**: The React wrapper only mounts in `NODE_ENV === "development"`.
- **Localhost Only**: The server binds to `127.0.0.1`. No external traffic.
- **One-click Consent**: First tool call spawns an explicit dialog. Deny = blocked for the session.
- **Conditional Persistence**: Approval persists across page reloads for **1 hour** by default. Check "Trust this device for 24 hours" in the dialog to extend to 24h. Click "Revoke Session" to clear early.
- **Opt-in Risk**: Screenshots and JS evaluation are disabled by default.

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
