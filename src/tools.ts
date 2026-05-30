/**
 * MCP tool definitions for the browser bridge.
 * These are the capabilities exposed to any MCP client (Claude Code, Cursor, etc.)
 */

export const BROWSER_TOOLS = {
	browser_console_logs: {
		description:
			"Read recent console logs from the browser session. Filter by level (log, warn, error, info).",
		inputSchema: {
			type: "object" as const,
			properties: {
				level: {
					type: "string",
					enum: ["all", "log", "warn", "error", "info"],
					default: "all",
				},
				limit: {
					type: "integer",
					default: 50,
					description: "Max number of log entries to return",
				},
			},
		},
	},
	browser_dom_query: {
		description:
			"Query the DOM using CSS selectors. Returns text content, attributes, and visibility.",
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
					description: "Include outer HTML for each match",
				},
			},
			required: ["selector"],
		},
	},
	browser_dom_snapshot: {
		description:
			"Return a text snapshot of the current page (visible text only, truncated).",
		inputSchema: {
			type: "object" as const,
			properties: {
				maxChars: {
					type: "integer",
					default: 4000,
					description: "Character budget for the snapshot",
				},
			},
		},
	},
	browser_network_requests: {
		description:
			"Return recent network requests (XHR/fetch) captured by the bridge.",
		inputSchema: {
			type: "object" as const,
			properties: {
				limit: { type: "integer", default: 20 },
				includeResponseBody: { type: "boolean", default: false },
			},
		},
	},
	browser_localstorage_get: {
		description: "Read values from localStorage by key prefix or exact key.",
		inputSchema: {
			type: "object" as const,
			properties: {
				key: { type: "string" },
				prefix: { type: "string" },
			},
		},
	},
	browser_screenshot: {
		description: "Capture a screenshot of the current viewport as base64 PNG.",
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
			"Evaluate JavaScript in the page context. Requires explicit user approval.",
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
		description: "Click an element on the page using a CSS selector.",
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
		description: "Type text into an input or textarea element.",
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
		description: "Scroll the page or a specific element.",
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
	browser_page_info: {
		description:
			"Get metadata about the current page, including URL, title, viewport dimensions, scroll positions, and user agent.",
		inputSchema: {
			type: "object" as const,
			properties: {},
		},
	},
	browser_cookie_get: {
		description: "Retrieve document cookies.",
		inputSchema: {
			type: "object" as const,
			properties: {
				name: {
					type: "string",
					description:
						"Optional name of a specific cookie to retrieve. If omitted, returns all cookies.",
				},
			},
		},
	},
} as const;

export type BrowserToolName = keyof typeof BROWSER_TOOLS;
