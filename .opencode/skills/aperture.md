# Aperture Project Skill

This skill provides specialized context for working on the Aperture browser-to-agent bridge.

## When to Use

Load this skill when:
- Working on any Aperture source code
- Adding new MCP tools or browser capabilities
- Debugging browser-server-agent communication
- Working on framework plugins (Next.js, Vite)
- Implementing the Chrome extension

## Project Context

**Aperture** connects browser tabs to MCP-capable AI agents, enabling:
- DOM inspection and querying
- Console log monitoring
- Network request tracking
- Screenshot capture
- Click/type/scroll automation
- JavaScript evaluation (with explicit consent)

## Key Files

### Server-Side
- `src/server.ts` - HTTP server, WebSocket handling, session management
- `src/mcp-server.ts` - MCP protocol implementation, tool routing
- `src/transports.ts` - Transport abstractions (WebSocket, SSE, HTTP)
- `src/tools.ts` - Tool definitions (schemas and descriptions)

### Browser-Side
- `src/client.ts` - Main browser client, connection management
- `src/client/handlers.ts` - Tool implementations (DOM queries, clicks, etc.)
- `src/client/patches.ts` - Console/network interception
- `src/client/ui.ts` - Approval dialogs and status badge
- `src/client/storage.ts` - localStorage wrapper for approval persistence

### Framework Integration
- `src/frameworks/next.ts` - Next.js plugin (`withAperture`)
- `src/frameworks/vite.ts` - Vite plugin (`aperture`)
- `src/frameworks/shared.ts` - Shared server startup logic

### Entry Points
- `src/react.tsx` - React component (`<Aperture />`)
- `src/register.ts` - Auto-initialization script
- `src/bin.ts` - CLI entry point

## Architecture Patterns

### Approval Flow
1. Agent connects via Streamable HTTP (`/mcp`)
2. Agent calls a tool (e.g., `browser_dom_query`)
3. Server forwards to browser via WebSocket
4. Browser checks approval state:
   - If approved: execute tool and return result
   - If not approved: show modal dialog
5. User clicks "Allow" in modal
6. Approval cached in localStorage (1 hour or 24 hours)
7. Future tool calls execute without prompting

### Session Management
- Each browser tab gets a unique `sessionId` (UUID)
- Agent can connect to multiple tabs
- Agent selects tab via `sessionId` parameter in tool calls
- If only one tab, `sessionId` is optional

### Transport Layer
- **Browser ↔ Server**: WebSocket at `/mcp?type=browser`
- **Agent ↔ Server**: Streamable HTTP at `/mcp` (POST/GET/DELETE)
- **Legacy**: SSE at `/sse` (deprecated, still supported)

## Common Development Tasks

### Adding a New Tool

1. **Define schema** in `src/tools.ts`:
   ```typescript
   browser_my_tool: {
     description: "What this tool does",
     inputSchema: {
       type: "object",
       properties: {
         param: { type: "string", description: "..." }
       },
       required: ["param"]
     }
   }
   ```

2. **Implement handler** in `src/client/handlers.ts`:
   ```typescript
   browser_my_tool: (_client, { param }) => {
     // Implementation
     return { result: "..." };
   }
   ```

3. **Add tests** in `tests/handlers.test.ts`

4. **Update docs** in `docs/capabilities.md`

### Debugging Connection Issues

1. Check server logs: `[Aperture]` messages in terminal
2. Check browser console: `[Aperture]` messages
3. Verify WebSocket connection in Network tab
4. Check approval state in localStorage:
   - `aperture_approved`: "true" or "false"
   - `aperture_capabilities`: JSON array
   - `aperture_ttl_ms`: TTL in milliseconds

### Testing with Real Agents

1. Start example app: `pnpm run example`
2. Configure agent (OpenCode, Claude Code, etc.):
   ```json
   {
     "mcpServers": {
       "aperture": {
         "url": "http://localhost:3456/mcp"
       }
     }
   }
   ```
3. Visit `http://localhost:3000`
4. Agent connects, approval dialog appears
5. Click "Allow"
6. Test tools via agent

## Security Model

- **Localhost binding**: Server only listens on `127.0.0.1`
- **Dev-only initialization**: Client only runs on localhost
- **Explicit consent**: Modal dialog for first tool call
- **Capability gating**: Screenshots and eval require checkbox consent
- **No secrets**: Never log sensitive data

## Known Gotchas

1. **Screenshot capture**: Uses `getDisplayMedia()` which requires user to select tab each time. Stream becomes inactive on page refresh.

2. **Network monitoring**: Only captures `fetch()`, not XHR or WebSocket. Uses monkey-patching of `window.fetch`.

3. **Console logs**: Buffered in memory (500 max). Logs are captured by monkey-patching `console.*` methods.

4. **Multi-tab routing**: If multiple tabs connected, agent must specify `sessionId`. If omitted and multiple approved tabs exist, returns error.

5. **React peer dependency**: Marked as optional so server-only usage doesn't require React.

## Testing Checklist

Before committing changes:
- [ ] `pnpm typecheck` passes
- [ ] `pnpm lint` passes
- [ ] `pnpm test` passes (unit tests)
- [ ] `pnpm test:e2e` passes (Playwright tests)
- [ ] `pnpm build` succeeds
- [ ] Manual test with sample app
- [ ] Manual test with real MCP client

## Resources

- [MCP Specification](https://modelcontextprotocol.io)
- [MCP SDK TypeScript](https://github.com/modelcontextprotocol/typescript-sdk)
- [Streamable HTTP Transport](https://modelcontextprotocol.io/specification/2025-03-26/basic/transports#streamable-http)
- [Chrome Extension Plan](../docs/plans/EXTENSION.md)
