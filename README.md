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

### More

- [How It Works](./docs/how-it-works.md)
- [MCP Capabilities](./docs/capabilities.md)
- [Security Model](./docs/security.md)
- [Architecture](./docs/architecture.md)
- [Debugging](./docs/debugging.md)
- [Chrome Extension Plan](./EXTENSION.md)

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
