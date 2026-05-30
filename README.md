# aperture

> Give MCP-capable AI agents a live view into your local dev session.

No extensions. No CORS hacks. Auto-connect your local dev browser to Claude Code, Cursor, or any other MCP-capable agent. The agent can tail console logs, query the DOM, inspect network requests, scroll, click, type, and evaluate JS — after you approve it with a single click.

## Installation

```bash
npm install -D @promptuary/aperture # or whatever you use
```

## Usage

### 1. Plug it in

#### Option A: React / Next.js
Drop the helper component at your app's root:

```tsx
import { Aperture } from "@promptuary/aperture/react";

export default function App({ children }) {
  return (
    <>
      {children}
      {process.env.NODE_ENV === "development" && <Aperture />}
    </>
  );
}
```

#### Option B: Standalone Script (HTML)
If you're not using React, load the script directly:

```html
<script src="http://localhost:3456/aperture.js"></script>
```

The client will automatically:
- Render a connection status badge in the bottom-left.
- Listen for incoming connections on `ws://localhost:3456`.
- Trigger a glassmorphic authorization modal on the first agent request.

---

### 2. Configure Your Agent

Add Aperture to your agent's MCP configurations.

**Claude Code (`~/.claude/settings.json`):**
```json
{
  "mcpServers": {
    "aperture": {
      "command": "pnpm",
      "args": ["dlx", "@promptuary/aperture"],
      "env": { "APERTURE_PORT": "3456" }
    }
  }
}
```

**Cursor (`~/.cursor/mcp.json`):**
```json
{
  "mcpServers": {
    "aperture": {
      "command": "pnpm",
      "args": ["dlx", "@promptuary/aperture"]
    }
  }
}
```

If the client cannot start the local WebSocket server automatically (e.g. running in Docker or headless envs), boot it manually:

```bash
pnpm dlx @promptuary/aperture
# or with a custom port
APERTURE_PORT=5678 pnpm dlx @promptuary/aperture
```

---

## MCP Capabilities

Once the agent connects, it can invoke these tools:

| Tool | Action | Requires |
|------|--------|----------|
| `browser_console_logs` | Retrieve console buffer (errors, warnings, logs) | Approval |
| `browser_dom_query` | CSS query DOM elements (attributes, visibility) | Approval |
| `browser_dom_snapshot` | Fast text content snapshot | Approval |
| `browser_network_requests` | Audit outgoing fetch/XHR network history | Approval |
| `browser_localstorage_get` | Query values from localStorage | Approval |
| `browser_cookie_get` | Read cookies | Approval |
| `browser_click` | Fire clicks (focuses, pointerdown/up, click sequence) | Approval |
| `browser_type` | Populate text inputs (bypasses React value tracking) | Approval |
| `browser_scroll` | Window or element scrolling / scrollIntoView | Approval |
| `browser_page_info` | Read title, URL, viewport dimensions | Approval |
| `browser_screenshot` | Viewport frame capture (uses tab sharing) | Screen Share Checkbox |
| `browser_evaluate` | Run arbitrary JS in page context | Evaluate Checkbox |

---

## Security Model

Aperture is designed for local development:
- **Dev Only**: The React wrapper only mounts in development mode.
- **Localhost Only**: The server binds to `127.0.0.1`. No external traffic allowed.
- **One-click Consent**: The first tool call spawns an explicit consent dialog. If you click Deny, the agent is blocked for the rest of the session.
- **No Persistence**: Approval decays on page reload. Clean slate every time.
- **Opt-in Risk**: Screenshots (uses standard browser tab share) and JavaScript evaluation are disabled by default. You must check the boxes to opt in.

---

## Local Development

If you want to contribute or test changes locally:

### 1. Setup, Build & Security Audit
```bash
# Install dependencies
pnpm install

# Start watch compilation
pnpm dev

# Build production bundle
pnpm build

# Quality & security lint (using Biome)
pnpm run check

# Format source files
pnpm run format

# Audit dependencies for vulnerabilities
pnpm run audit:deps
```

### 2. Link for local testing
To test this package locally in another project:

```bash
# In the aperture directory:
pnpm link --global

# In your test project directory (e.g. your React app):
pnpm link --global @promptuary/aperture
```

License: MIT
