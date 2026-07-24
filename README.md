<div align="center">

# 📷 Aperture

> *Agent sees your current browser session*

[![npm version](https://img.shields.io/npm/v/@ericmhalvorsen/aperture?style=for-the-badge&color=6366f1&labelColor=0f172a)](https://www.npmjs.com/package/@ericmhalvorsen/aperture)
[![License](https://img.shields.io/npm/l/@ericmhalvorsen/aperture?style=for-the-badge&color=8b5cf6&labelColor=0f172a)](./LICENSE)
[![MCP Protocol](https://img.shields.io/badge/MCP-Standard-10b981?style=for-the-badge&logoColor=white&labelColor=0f172a)](https://modelcontextprotocol.io)
[![TypeScript](https://img.shields.io/badge/TypeScript-Strict-3178C6?style=for-the-badge&logo=typescript&logoColor=white&labelColor=0f172a)](https://www.typescriptlang.org/)

**A zero-extension dev sidecar & MCP bridge connecting your local web app directly to AI coding agents.**

[Features](#key-capabilities) • [Quickstart](#5-minute-quickstart) • [How It Works](./docs/how-it-works.md) • [Capabilities](./docs/capabilities.md) • [Security](./docs/security.md)

</div>

---

This package gives MCP-capable AI coding agents (Claude Code, Cursor, OpenCode, Windsurf) a live, interactive window into your active development browser sessions. Instead of manually copy-pasting stack traces, taking desktop screenshots, or guessing computed styling, let an agent look directly at what you're building.

### Why this and why not just a browser extension?

* Good question. I don't like browser extensions—this package is a great fit for web applications that you run locally. The idea is that **the application itself** allows your local agent to connect, not a global browser extension. Feel free to just grab claude in chrome but this works better for my use cases.

* Extensions for Chrome and Firefox are on the roadmap for when you want agent inspection on any webpage beyond your local apps. Or just grab an existing extension and skip this one if all you're looking for is browser automation.

* Optionally have either your webserver or your agent harness start the MCP server.

### Key Capabilities

| Feature | Description |
| :--- | :--- |
| 👁️ **DOM & Visual Context** | Inspect DOM elements, query selectors, styles, and capture viewport screenshots directly from the page. |
| 🪵 **Console & Network Audit** | Stream live browser console logs (`log`, `warn`, `error`) and fetch/XHR network request histories straight to your AI agent. |
| ⚡ **Zero Extension Setup** | Mount `<Aperture />` in React/Next.js or import the register module in Vite/vanilla JS. Works in standard Chrome, Firefox, Safari, and Zen. |
| 🔒 **Explicit Consent & Safety** | Runs strictly on `127.0.0.1`. The initial tool request opens an in-browser modal requiring explicit user consent and opt-in for sensitive capabilities. |
| 🔀 **Multi-Tab Sessions** | Connect multiple browser tabs simultaneously and let your agent query, target, and switch tabs on the fly. |

---


## 5-Minute Quickstart

### 1. Connect your agent

Configure your MCP-capable agent to start the Aperture bridge server.

**Claude Desktop / Claude Code**
Add to `claude_desktop_config.json` (or your Claude Code config):
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

**Cursor**
Go to Cursor Settings > MCP and add a new server:
- Type: `command`
- Name: `aperture`
- Command: `npx -y @ericmhalvorsen/aperture stdin`

**OpenCode / Windsurf**
Add to your `mcp.json` or equivalent configuration:
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

### 2. Add the client to your app

**React/Next.js:**
```bash
npm install -D @ericmhalvorsen/aperture
```

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
```bash
npm install -D @ericmhalvorsen/aperture
```

```typescript
// In your main entry file
import "@ericmhalvorsen/aperture/register";
```

**No bundler:**
```html
<script src="http://localhost:3456/aperture.js"></script>
```

### 3. Start your dev server

Start your app's dev server as usual:

```bash
npm run dev
```

You should see a badge only while the Aperture server is connected. Its dot is yellow while approval is pending, green when approved, and red when access is denied.
When the agent makes its first request, you'll see an approval dialog in your browser. Click "Allow" to grant access.

### More

- [How It Works](./docs/how-it-works.md)
- [MCP Capabilities](./docs/capabilities.md)
- [Security Model](./docs/security.md)
- [Architecture](./docs/architecture.md)
- [Debugging](./docs/debugging.md)
- [Chrome Extension Plan](./docs/plans/EXTENSION.md)

---

## AI Development Policy

This project is developed in part using AI. When submitting pull requests, you may use AI but please review your submission carefully. The pull request will be treated as if it was written by you.

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
