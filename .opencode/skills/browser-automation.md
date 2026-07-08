# Browser Automation Skill

This skill provides context for implementing browser automation tools in Aperture.

## When to Use

Load this skill when:
- Adding new browser interaction tools (click, type, scroll, etc.)
- Implementing DOM inspection capabilities
- Working with browser APIs (console, network, storage)
- Debugging browser-side tool execution
- Improving screenshot capture

## Browser Tool Architecture

### Tool Flow

```
Agent → Server (MCP) → WebSocket → Browser Client → Tool Handler → Result
```

1. Agent calls tool via MCP protocol
2. Server routes to browser via WebSocket
3. Browser client receives `tool_call` message
4. Client dispatches to appropriate handler
5. Handler executes and returns result
6. Client sends `result` message back
7. Server wraps in MCP response

### Handler Signature

```typescript
type ToolHandler = (
  client: ApertureClient,
  args: Record<string, any>
) => any | Promise<any>;
```

Handlers receive:
- `client`: ApertureClient instance (for accessing screen capture stream, etc.)
- `args`: Tool arguments from agent

Handlers return:
- Any serializable value (will be JSON-stringified)
- Error object: `{ error: "message" }`

## Existing Tools

### DOM Tools

**browser_dom_query**
- Uses `document.querySelectorAll()`
- Returns: tag, text (truncated), visibility, attributes, optional HTML
- Limitation: 200 char text, 500 char HTML

**browser_page_info**
- Returns: URL, title, viewport dimensions, scroll position, user agent, console logs
- Console logs filtered by level, limited by count

### Interaction Tools

**browser_click**
- Dispatches full event sequence: pointerdown → mousedown → pointerup → mouseup → click
- Focuses element before clicking
- Returns: `{ success: true }` or `{ error: "..." }`

**browser_type**
- Handles `<input>`, `<textarea>`, and `contenteditable`
- Uses native value setters to trigger framework change handlers
- Dispatches `input` and `change` events
- Returns: `{ success: true }` or `{ error: "..." }`

**browser_scroll**
- Two modes:
  1. Scroll to position: `{ x, y }`
  2. Scroll element into view: `{ selector, scrollIntoView: true }`
- Returns: final scroll position

### Inspection Tools

**browser_network_requests**
- Captures `fetch()` calls via monkey-patching
- Returns: URL, method, status, timing, response text
- Limitation: 100 request buffer, no XHR/WebSocket

**browser_storage_get**
- Reads localStorage or cookies
- localStorage: by key, prefix, or all
- cookies: by name or all
- Returns: key-value object

**browser_screenshot**
- Uses `getDisplayMedia()` for screen capture
- Renders video frame to canvas, exports as PNG
- Requires user to grant screen share permission
- Returns: base64 PNG data

**browser_evaluate**
- Executes arbitrary JavaScript via `window.eval()`
- Requires explicit user consent (checkbox in approval dialog)
- Returns: stringified result

## Implementation Patterns

### DOM Query Pattern

```typescript
browser_my_dom_tool: (_client, { selector, options }) => {
  const elements = Array.from(document.querySelectorAll(selector));
  return elements.map(el => ({
    // Extract relevant data
    tag: el.tagName.toLowerCase(),
    text: el.textContent?.slice(0, 200) || "",
    visible: !!(el as HTMLElement).offsetParent,
    // ... more fields
  }));
}
```

### Event Dispatch Pattern

```typescript
browser_my_interaction_tool: (_client, { selector }) => {
  const element = document.querySelector(selector) as HTMLElement | null;
  if (!element) {
    return { error: `Element not found: ${selector}` };
  }
  
  // Dispatch events
  const events = ["pointerdown", "mousedown", "pointerup", "mouseup", "click"];
  for (const name of events) {
    const ev = new MouseEvent(name, {
      bubbles: true,
      cancelable: true,
    });
    element.dispatchEvent(ev);
  }
  
  return { success: true };
}
```

### Async Operation Pattern

```typescript
browser_my_async_tool: async (_client, args) => {
  try {
    const result = await someAsyncOperation();
    return { result };
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}
```

## Browser APIs

### Console Capture

Located in `src/client/patches.ts`:
- Monkey-patches `console.log/warn/error/info/debug`
- Stores messages in ring buffer (500 max)
- Each entry: `{ level, message, timestamp }`

### Network Capture

Located in `src/client/patches.ts`:
- Monkey-patches `window.fetch`
- Stores requests in ring buffer (100 max)
- Each entry: `{ url, method, start, end, status, responseText, error? }`

### Storage Access

Located in `src/client/storage.ts`:
- Wrapper around `localStorage`
- Handles SSR (checks `typeof window`)
- Used for approval persistence

### Screen Capture

Located in `src/client.ts`:
- Uses `navigator.mediaDevices.getDisplayMedia()`
- Renders video to canvas, exports as PNG
- Stream stored in `ApertureClient.screenCaptureStream`
- Becomes inactive on page refresh

## Common Challenges

### Framework Compatibility

**Problem**: React/Vue/Angular use synthetic events and virtual DOM
**Solution**: 
- Use native value setters for inputs
- Dispatch both `input` and `change` events
- Use full event sequence (pointer + mouse events)

### Timing Issues

**Problem**: Elements may not be in DOM yet
**Solution**: 
- Return error if element not found
- Agent should retry or wait for element

### Security Restrictions

**Problem**: Some pages block script injection
**Solution**: 
- Content scripts run in isolated world
- Can't access page's JS variables directly
- Use `window.eval()` for page context execution

### Screenshot Quality

**Problem**: Screenshots may be black or low quality
**Solution**: 
- Wait for video frame to paint (`requestVideoFrameCallback`)
- Use actual video dimensions, not defaults
- Handle inactive stream (re-prompt user)

## Testing Browser Tools

### Unit Tests

Mock DOM APIs:
```typescript
import { JSDOM } from "jsdom";

const dom = new JSDOM("<!DOCTYPE html><html><body></body></html>");
global.document = dom.window.document;
global.window = dom.window;
```

### Manual Testing

1. Start example app: `pnpm run example`
2. Open browser DevTools
3. Connect MCP client
4. Call tool via agent
5. Check browser console for errors
6. Verify result in agent response

## Performance Considerations

- **DOM queries**: Limit result size (truncate text/HTML)
- **Network buffer**: Ring buffer prevents memory leaks
- **Console buffer**: 500 entry limit
- **Screenshot**: Capture only visible viewport
- **Event dispatch**: Synchronous, no artificial delays

## Edge Cases and Error Handling

### Element Not Found

```typescript
const element = document.querySelector(selector);
if (!element) {
  return { error: `Element not found: ${selector}` };
}
```

### Invalid Selector

```typescript
try {
  const elements = document.querySelectorAll(selector);
} catch (e) {
  return { error: `Invalid selector: ${selector}` };
}
```

### Permission Denied

```typescript
if (!session.capabilities.has("screenshot")) {
  return { error: "Screenshot permission not granted" };
}
```

### Timeout

```typescript
const timeout = toolName === "browser_screenshot" ? 60000 : 15000;
const result = await waitForBrowserResult(pendingRequests, requestId, timeout);
if (!result) {
  return { error: "Browser session did not respond in time" };
}
```

## Integration Examples

### Using with React

```typescript
// In your React component
import { Aperture } from "@ericmhalvorsen/aperture/react";

export default function App() {
  return (
    <div>
      <Aperture 
        customTools={{
          get_user_data: {
            description: "Get current user data",
            inputSchema: { type: "object", properties: {} },
            handler: () => {
              return { user: "John Doe", email: "john@example.com" };
            }
          }
        }}
      />
      {/* Your app content */}
    </div>
  );
}
```

### Using with Next.js

```typescript
// app/layout.tsx
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

### Using with Vite

```typescript
// main.ts
import "@ericmhalvorsen/aperture/register";

// Your app code
```

## Troubleshooting

### Tool Not Executing

1. Check browser console for errors
2. Verify tool is registered in `src/tools.ts`
3. Verify handler is implemented in `src/client/handlers.ts`
4. Check approval state (first call requires approval)

### Incorrect Results

1. Verify selector matches elements
2. Check for timing issues (element not yet rendered)
3. Verify handler logic in `src/client/handlers.ts`
4. Check browser console for errors

### Performance Issues

1. Limit DOM query result sizes
2. Use targeted selectors instead of broad ones
3. Avoid large HTML dumps (use `includeHtml: false`)
4. Check buffer sizes in `src/client/patches.ts`

## Resources

- [MDN: Document Object Model](https://developer.mozilla.org/en-US/docs/Web/API/Document_Object_Model)
- [MDN: Event reference](https://developer.mozilla.org/en-US/docs/Web/Events)
- [MDN: getDisplayMedia()](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getDisplayMedia)
- [MDN: localStorage](https://developer.mozilla.org/en-US/docs/Web/API/Window/localStorage)
