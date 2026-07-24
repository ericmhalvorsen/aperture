export type JsonSchema = Readonly<Record<string, unknown>>;

export interface ToolMetadata {
	name: string;
	description: string;
	inputSchema: JsonSchema;
}

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

export type ClientToServerMessage =
	| WSRegisterMessage
	| WSApprovalMessage
	| WSFocusMessage
	| WSResultMessage;
export type ServerToClientMessage =
	| WSRegisteredMessage
	| WSAgentConnectedMessage
	| WSToolCallMessage;

export interface BrowserSession {
	ws: import("ws").WebSocket;
	url: string;
	title: string;
	approved: boolean;
	lastActiveAt: number;
	capabilities: Set<string>;
	customTools?: ToolMetadata[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function isStringArray(value: unknown): value is string[] {
	return (
		Array.isArray(value) && value.every((item) => typeof item === "string")
	);
}

function isToolMetadata(value: unknown): value is ToolMetadata {
	return (
		isRecord(value) &&
		typeof value.name === "string" &&
		typeof value.description === "string" &&
		isRecord(value.inputSchema)
	);
}

export function isClientToServerMessage(
	value: unknown,
): value is ClientToServerMessage {
	if (!isRecord(value) || typeof value.type !== "string") return false;

	switch (value.type) {
		case "register":
			return (
				typeof value.url === "string" &&
				typeof value.title === "string" &&
				(value.customTools === undefined ||
					(Array.isArray(value.customTools) &&
						value.customTools.every(isToolMetadata)))
			);
		case "approval":
			return (
				typeof value.approved === "boolean" &&
				(value.capabilities === undefined || isStringArray(value.capabilities))
			);
		case "focus":
			return typeof value.focused === "boolean";
		case "result":
			return typeof value.requestId === "string" && "result" in value;
		default:
			return false;
	}
}

export function isServerToClientMessage(
	value: unknown,
): value is ServerToClientMessage {
	if (!isRecord(value) || typeof value.type !== "string") return false;

	switch (value.type) {
		case "registered":
			return typeof value.sessionId === "string";
		case "agent_connected":
			return true;
		case "tool_call":
			return (
				typeof value.requestId === "string" &&
				typeof value.tool === "string" &&
				isRecord(value.args)
			);
		default:
			return false;
	}
}
