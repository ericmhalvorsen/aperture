export interface ToolMetadata {
	name: string;
	description: string;
	inputSchema: object;
}

// WebSocket Message Types between Browser Client and Aperture Server

interface WSRegisterMessage {
	type: "register";
	url: string;
	title: string;
	customTools?: ToolMetadata[];
}

interface WSRegisteredMessage {
	type: "registered";
	sessionId: string;
}

interface WSAgentConnectedMessage {
	type: "agent_connected";
}

interface WSApprovalMessage {
	type: "approval";
	approved: boolean;
	capabilities?: string[];
}

export interface WSToolCallMessage {
	type: "tool_call";
	requestId: string;
	tool: string;
	args: Record<string, unknown>;
}

interface WSFocusMessage {
	type: "focus";
	focused: boolean;
}

interface WSResultMessage {
	type: "result";
	requestId: string;
	result: unknown;
}

interface WSBrowserResultMessage {
	type: "browser_result";
	requestId: string;
	result: unknown;
}

export type ClientToServerMessage =
	| WSRegisterMessage
	| WSApprovalMessage
	| WSFocusMessage
	| WSResultMessage;
export type ServerToClientMessage =
	| WSRegisteredMessage
	| WSAgentConnectedMessage
	| WSToolCallMessage;

// Internal Server session representation
export interface BrowserSession {
	ws: import("ws").WebSocket;
	url: string;
	title: string;
	approved: boolean;
	lastActiveAt: number;
	capabilities: Set<string>;
	customTools?: ToolMetadata[];
}

// MCP JSON-RPC Types
export interface MCPRequest {
	jsonrpc: "2.0";
	id: number | string;
	method: string;
	params?: unknown;
}

export interface MCPResponse {
	jsonrpc: "2.0";
	id: number | string | null;
	result?: unknown;
	error?: { code: number; message: string };
}
