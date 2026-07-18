# AGENTS.md - AI Agent Instructions

This file provides context and instructions for AI agents working on the Aperture project.

## Project Overview

**Aperture** is a browser-to-agent bridge that gives MCP-capable AI agents a live view into local dev sessions. It enables agents to inspect DOM, capture screenshots, monitor console logs, and interact with web pages during development.

**Tagline**: "Let Agent see browser. Agent build better stuff. Perchance"

## Architecture

### Core Components

1. **Browser Client** (`src/client.ts`, `src/client/`)
   - Runs in the browser tab
   - Injects into page via React component, script tag, or auto-initialization
   - Captures console logs, network requests, DOM state
   - Communicates with server via WebSocket

2. **Server** (`src/server.ts`, `src/mcp-server.ts`)
   - Runs as a dev sidecar (Next.js/Vite plugin or standalone)
   - Exposes MCP tools to AI agents via Streamable HTTP (`/mcp`)
   - Manages browser sessions and tool routing
   - Handles approval flow and security

3. **Framework Integrations** (`src/react.tsx`, `src/register.ts`)
   - `<Aperture />` React component for Next.js/React apps
   - Auto-initialization script for Vanilla/Vite apps
   - Connects to the local server via WebSocket

### Key Patterns

- **Approval Flow**: First tool call triggers a modal dialog requiring user consent
- **Session Management**: Multiple browser tabs can connect; agent selects via `sessionId`
- **Capability System**: Granular permissions (console, dom, network, screenshot, evaluate)
- **Custom Tools**: Users can register custom tools via the React component

## Code Conventions

### Style
- **Formatter**: Biome (not Prettier)
- **Indentation**: Tabs
- **Quotes**: Double quotes
- **Semicolons**: Required
- **TypeScript**: Strict mode enabled
- **Comments**: Minimal - code should be self-documenting

### Testing
- **Unit Tests**: Vitest (`tests/`)
- **E2E Tests**: Playwright (`tests/e2e/`)
- **Coverage**: 50% minimum (lines, functions, statements)
- **Test Pattern**: `*.test.ts` for unit, `*.spec.ts` for E2E

### File Organization
```
src/
├── client.ts          # Main browser client
├── client/            # Browser-side modules
│   ├── handlers.ts    # Tool implementations
│   ├── patches.ts     # Console/network patching
│   ├── storage.ts     # localStorage wrapper
│   └── ui.ts          # Approval/status dialogs
├── server.ts          # HTTP server + WebSocket
├── mcp-server.ts      # MCP protocol implementation
├── transports.ts      # Transport layer abstractions
├── tools.ts           # Tool definitions
├── types.ts           # Shared types
├── react.tsx          # React component
├── register.ts        # Auto-initialization
└── bin.ts             # CLI entry point
```

## Common Tasks

### Adding a New Tool

1. Define in `src/tools.ts`:
   ```typescript
   browser_my_tool: {
     description: "...",
     inputSchema: { type: "object", properties: {...} },
   }
   ```

2. Implement handler in `src/client/handlers.ts`:
   ```typescript
   browser_my_tool: (_client, args) => {
     // Implementation
     return { result: "..." };
   }
   ```

3. Add tests in `tests/handlers.test.ts`

### Adding a New Framework Plugin

1. Create `src/frameworks/myframework.ts`
2. Export a setup function that calls `ensureApertureServer()`
3. Add export to `package.json` exports field
4. Update README quickstart

### Debugging

- **Server logs**: Check stderr for `[Aperture]` prefixed messages
- **Browser logs**: Check console for `[Aperture]` prefixed messages
- **Verbose mode**: Run with `-v` flag to see all MCP traffic
- **Network inspection**: Use browser DevTools Network tab

## Security Considerations

- **Localhost Only**: Server binds to `127.0.0.1`, never expose to network
- **Dev Only**: Client only initializes on localhost/127.0.0.1
- **User Consent**: All tool calls require explicit approval (except `browser_list_sessions`)
- **Opt-in Risk**: Screenshots and JS evaluation require explicit checkbox consent
- **No Secrets**: Never log or expose sensitive data in tool responses

## Testing Strategy

### Unit Tests (Vitest)
- Test individual functions and classes
- Mock WebSocket connections
- Test tool handlers in isolation
- Run with: `pnpm test`

### E2E Tests (Playwright)
- Test full approval flow
- Test multi-session scenarios
- Test tool execution end-to-end
- Run with: `pnpm test:e2e`

### Manual Testing
- Use sample apps in `samples/`
- Test with real MCP clients (Claude Code, OpenCode, Cursor)
- Verify all tools work as documented

## Build & Release

### Build
```bash
pnpm build          # Build both server and browser bundles
pnpm dev            # Watch mode for development
```

### Release Process
1. Create changeset: `pnpm changeset`
2. Version: `pnpm version-packages`
3. Commit: `git commit -m "chore: release"`
4. Tag: `git tag vX.Y.Z`
5. Publish: `pnpm publish --access public`

## Known Limitations

- **Screenshots**: Require `getDisplayMedia()` which prompts user each time
- **Network Monitoring**: Only captures `fetch()`, not XHR or WebSocket
- **Console Logs**: Buffered in memory (500 entries max)
- **Multi-tab**: Agent must explicitly select tab via `sessionId`

## Future Work

See `docs/plans/` for detailed plans:
- Chrome extension for auto-injection
- Native messaging host for zero-config setup
- Firefox/Zen support (already works, just needs testing)

## Resources

- [MCP Specification](https://modelcontextprotocol.io)
- [MCP SDK Docs](https://github.com/modelcontextprotocol/typescript-sdk)
- [Project README](./README.md)
- [Architecture Docs](./docs/architecture.md)
