# MCP Development Skill

This skill provides context for working with the Model Context Protocol (MCP).

## When to Use

Load this skill when:
- Implementing or modifying MCP protocol features
- Working with MCP transports (Streamable HTTP, SSE, stdio)
- Debugging MCP client-server communication
- Adding new MCP capabilities
- Working with JSON-RPC message format

## MCP Overview

**Model Context Protocol** is a standardized protocol for AI agents to interact with external tools and data sources. It uses JSON-RPC 2.0 over various transports.

## Key Concepts

### Transport Types

1. **Streamable HTTP** (current standard)
   - Single endpoint: `/mcp`
   - POST: Client sends JSON-RPC, server returns JSON or SSE
   - GET: Client opens SSE stream for server-initiated messages
   - DELETE: Client terminates session
   - Session management via `Mcp-Session-Id` header

2. **SSE** (deprecated)
   - Separate endpoints: `/sse` (GET) and `/messages/{sessionId}` (POST)
   - Still supported for backwards compatibility

3. **WebSocket** (custom)
   - Used for browser-to-server communication
   - Path: `/mcp?type=browser`

4. **stdio**
   - Used for local agent-server communication
   - JSON-RPC over stdin/stdout

### Message Types

**Request** (expects response):
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/list",
  "params": {}
}
```

**Response** (to request):
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "tools": [...]
  }
}
```

**Notification** (no response expected):
```json
{
  "jsonrpc": "2.0",
  "method": "notifications/initialized"
}
```

### Core Methods

**Initialization**:
- `initialize` - Establish connection, negotiate capabilities
- `notifications/initialized` - Client confirms initialization

**Tool Execution**:
- `tools/list` - List available tools
- `tools/call` - Execute a tool

**Resources** (not used in Aperture):
- `resources/list` - List available resources
- `resources/read` - Read a resource

**Prompts** (not used in Aperture):
- `prompts/list` - List available prompts
- `prompts/get` - Get a prompt

## Aperture's MCP Implementation

### Server Capabilities

```typescript
{
  capabilities: {
    tools: {}
  }
}
```

Aperture only exposes tools (no resources or prompts).

### Tool Definition Format

```typescript
{
  name: "browser_dom_query",
  description: "Query the DOM using a CSS selector...",
  inputSchema: {
    type: "object",
    properties: {
      selector: {
        type: "string",
        description: "CSS selector (e.g., '#app h1')"
      }
    },
    required: ["selector"]
  }
}
```

### Tool Call Flow

1. Agent sends `tools/call` with tool name and arguments
2. Server validates tool exists and routes to browser
3. Browser executes handler and returns result
4. Server wraps result in MCP response format
5. Agent receives result

### Error Handling

**Tool not found**:
```json
{
  "content": [
    {
      "type": "text",
      "text": "Tool not found: browser_foo"
    }
  ],
  "isError": true
}
```

**Browser timeout** (no response in 15s):
```json
{
  "content": [
    {
      "type": "text",
      "text": "Browser session did not respond in time."
    }
  ],
  "isError": true
}
```

## Streamable HTTP Implementation

### Session Lifecycle

1. **Initialize**: POST to `/mcp` without session ID
   - Server generates session ID
   - Returns `Mcp-Session-Id` header
   - Stores session in `streamableSessions` map

2. **Subsequent requests**: Include `Mcp-Session-Id` header
   - Server validates session exists
   - Routes to existing transport instance

3. **Terminate**: DELETE to `/mcp` with session ID
   - Server removes session from map
   - Closes transport

### Code Pattern

```typescript
// Create transport with session ID generator
const transport = new StreamableHTTPServerTransport({
  sessionIdGenerator: () => randomUUID(),
  onsessioninitialized: (sessionId) => {
    // Store transport for later requests
    sessions.set(sessionId, transport);
  }
});

// Handle request
await transport.handleRequest(req, res);
```

## Integration Examples

### Using with Claude Code

Add to `~/.claude/claude_desktop_config.json`:
```json
{
  "mcpServers": {
    "aperture": {
      "url": "http://localhost:3456/mcp"
    }
  }
}
```

### Using with OpenCode

Add to `opencode.json`:
```json
{
  "mcpServers": {
    "aperture": {
      "url": "http://localhost:3456/mcp"
    }
  }
}
```

### Using with Cursor

Add to Cursor settings → MCP:
```json
{
  "mcpServers": {
    "aperture": {
      "url": "http://localhost:3456/mcp"
    }
  }
}
```

## Debugging MCP Issues

### Check Protocol Version

Request headers should include:
```
MCP-Protocol-Version: 2025-03-26
```

### Verify Message Format

All messages must be valid JSON-RPC 2.0:
- Must have `jsonrpc: "2.0"`
- Requests must have `id` and `method`
- Responses must have `id` and either `result` or `error`

### Common Errors

**400 Bad Request**: Missing session ID on non-initial request
**404 Not Found**: Invalid or expired session ID
**405 Method Not Allowed**: Wrong HTTP method for endpoint

## Testing MCP Clients

### Using curl

```bash
# Initialize
curl -X POST http://localhost:3456/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "initialize",
    "params": {
      "protocolVersion": "2025-03-26",
      "capabilities": {},
      "clientInfo": { "name": "test", "version": "1.0" }
    }
  }'

# Extract session ID from response headers, then:
curl -X POST http://localhost:3456/mcp \
  -H "Content-Type: application/json" \
  -H "Mcp-Session-Id: <session-id>" \
  -d '{
    "jsonrpc": "2.0",
    "id": 2,
    "method": "tools/list"
  }'
```

### Using a Test Script

```javascript
// test-mcp.js
const response = await fetch('http://localhost:3456/mcp', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json, text/event-stream'
  },
  body: JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: '2025-03-26',
      capabilities: {},
      clientInfo: { name: 'test', version: '1.0' }
    }
  })
});

const sessionId = response.headers.get('Mcp-Session-Id');
console.log('Session ID:', sessionId);
```

## Performance Considerations

- **Session Management**: Sessions are stored in memory. For long-running servers, consider implementing session cleanup for inactive sessions.
- **Message Size**: Large tool results (e.g., full DOM dumps) can impact performance. Limit result sizes in tool implementations.
- **Concurrent Requests**: The server handles multiple concurrent tool calls. Ensure browser handlers are non-blocking where possible.
- **Timeout Handling**: Tool calls timeout after 15 seconds (60 seconds for screenshots). Adjust timeouts based on expected operation duration.

## Troubleshooting

### Agent Can't Connect

1. Verify server is running: Check for `[Aperture] MCP server on http://localhost:3456/mcp` in logs
2. Check port availability: Ensure port 3456 is not in use
3. Verify URL format: Use `http://localhost:3456/mcp` (not `/sse` unless using legacy mode)

### Tool Calls Hang

1. Check browser connection: Verify browser tab shows green badge
2. Check approval state: First tool call requires user approval
3. Check browser console: Look for `[Aperture]` error messages
4. Verify WebSocket connection: Check Network tab for active WebSocket

### Session Errors

**400 Bad Request**: Add `Mcp-Session-Id` header from initialization response
**404 Not Found**: Session expired or invalid. Re-initialize connection
**Multiple sessions error**: Use `browser_list_sessions` to get session IDs, then specify `sessionId` in tool calls

## Resources

- [MCP Specification](https://modelcontextprotocol.io/specification)
- [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk)
- [JSON-RPC 2.0 Specification](https://www.jsonrpc.org/specification)
- [Streamable HTTP Transport](https://modelcontextprotocol.io/specification/2025-03-26/basic/transports#streamable-http)
