# @ericmhalvorsen/aperture

> Let Agent see browser. Agent build better stuff. Perchance

No extensions. No CORS hacks. Auto-connect your local dev browser to Claude Code, Cursor, OpenCode, or any other MCP-capable agent.

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

You should see a green dot badge in the bottom-right of your page when the agent is connected.
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
