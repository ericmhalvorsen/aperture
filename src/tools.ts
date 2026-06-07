/**
 * MCP tool definitions for the browser bridge.
 * These are the capabilities exposed to any MCP client (Claude Code, Cursor, etc.)
 */

export const BROWSER_TOOLS = {
	browser_dom_query: {
		description:
			"Query the DOM using a CSS selector. Returns matched elements with their tag, text content, attributes, and visibility. Always prefer targeted selectors (e.g. '#app h1', '.nav-links a') over broad ones like 'body' or 'html'.",
		inputSchema: {
			type: "object" as const,
			properties: {
				selector: {
					type: "string",
					description: "CSS selector (e.g., '#app h1', '.error')",
				},
				includeHtml: {
					type: "boolean",
					default: false,
					description: "Include outer HTML for each matched element",
				},
			},
			required: ["selector"],
		},
	},
	browser_network_requests: {
		description:
			"Return recent network requests (fetch/XHR) captured by the bridge. Returns an array of request objects with method, URL, status, and timing. Only captures fetch() calls — XHR is not intercepted.",
		inputSchema: {
			type: "object" as const,
			properties: {
				limit: {
					type: "integer",
					default: 20,
					description: "Max number of requests to return",
				},
			},
		},
	},
	browser_page_info: {
		description:
			"Get the current state of the page: URL, title, viewport dimensions, scroll position, user agent, and recent console logs. Use this to orient yourself before querying specific elements.",
		inputSchema: {
			type: "object" as const,
			properties: {
				logLimit: {
					type: "integer",
					default: 20,
					description: "Max number of console log entries to include",
				},
				logLevel: {
					type: "string",
					enum: ["all", "log", "warn", "error", "info"],
					default: "all",
					description: "Filter console logs by level",
				},
			},
		},
	},
	browser_storage_get: {
		description:
			"Read values from browser storage. Use type='localStorage' to read localStorage entries (by exact key, prefix, or all). Use type='cookie' to read document cookies (by exact name or all).",
		inputSchema: {
			type: "object" as const,
			properties: {
				type: {
					type: "string",
					enum: ["localStorage", "cookie"],
					description: "Storage type to read from",
				},
				key: {
					type: "string",
					description:
						"Exact key to read from localStorage (localStorage only)",
				},
				prefix: {
					type: "string",
					description:
						"Key prefix to match in localStorage — returns all keys starting with this string (localStorage only)",
				},
				name: {
					type: "string",
					description:
						"Exact cookie name to retrieve (cookie only). If omitted, returns all cookies.",
				},
			},
			required: ["type"],
		},
	},
	browser_screenshot: {
		description:
			"Capture a screenshot of the current viewport as base64 PNG. NOTE: If the user has not yet granted screenshot access for this browser session, an approval modal will appear in the page. Ask the user to click 'Allow' in the Aperture dialog before proceeding.",
		inputSchema: {
			type: "object" as const,
			properties: {
				selector: {
					type: "string",
					description:
						"Optional: screenshot a specific element instead of full viewport",
				},
			},
		},
	},
	browser_evaluate: {
		description:
			"Evaluate JavaScript in the page context and return the result as a string. Objects are JSON-serialized. NOTE: This requires explicit user approval. If not yet approved, an Aperture dialog will appear in the page — ask the user to click 'Allow' before proceeding.",
		inputSchema: {
			type: "object" as const,
			properties: {
				expression: {
					type: "string",
					description: "JavaScript expression to evaluate",
				},
			},
			required: ["expression"],
		},
	},
	browser_click: {
		description:
			"Click an element on the page using a CSS selector. Dispatches the full pointer/mouse event sequence (pointerdown, mousedown, pointerup, mouseup, click) for maximum compatibility with frameworks. Returns success or an error if the element is not found.",
		inputSchema: {
			type: "object" as const,
			properties: {
				selector: {
					type: "string",
					description: "CSS selector of the element to click",
				},
			},
			required: ["selector"],
		},
	},
	browser_type: {
		description:
			"Type text into an input, textarea, or contenteditable element. Uses native value setters to trigger framework change handlers. Dispatches 'input' and 'change' events after setting the value.",
		inputSchema: {
			type: "object" as const,
			properties: {
				selector: {
					type: "string",
					description: "CSS selector of the input element",
				},
				text: { type: "string", description: "Text to type" },
			},
			required: ["selector", "text"],
		},
	},
	browser_scroll: {
		description:
			"Scroll the page or a specific element to a position, or scroll an element into view. Without coordinates, scrolls to the specified x/y offset. With scrollIntoView=true, smoothly scrolls the element into the viewport center.",
		inputSchema: {
			type: "object" as const,
			properties: {
				selector: {
					type: "string",
					description:
						"Optional CSS selector of the element to scroll. If omitted, scrolls the window.",
				},
				x: {
					type: "integer",
					description: "Horizontal scroll position in pixels",
				},
				y: {
					type: "integer",
					description: "Vertical scroll position in pixels",
				},
				scrollIntoView: {
					type: "boolean",
					description:
						"If true, scrolls the target element into view (requires selector).",
				},
			},
		},
	},
	browser_list_sessions: {
		description:
			"List all connected browser sessions with metadata (URL, title, approval status). Use this to choose which session to interact with when multiple tabs are connected.",
		inputSchema: {
			type: "object" as const,
			properties: {},
		},
	},
} as const;

export type BrowserToolName = keyof typeof BROWSER_TOOLS;
