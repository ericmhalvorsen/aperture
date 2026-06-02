export interface ConsoleEntry {
	level: string;
	message: string;
	timestamp: number;
}

export interface NetworkEntry {
	url: string;
	method: string;
	start: number;
	end: number;
	status: number;
	responseText: string;
	error?: string;
}

const consoleBuffer: ConsoleEntry[] = [];
const networkBuffer: NetworkEntry[] = [];

export function getConsoleBuffer(): ConsoleEntry[] {
	return consoleBuffer;
}

export function getNetworkBuffer(): NetworkEntry[] {
	return networkBuffer;
}

export function patchConsole() {
	const levels = ["log", "warn", "error", "info", "debug"] as const;
	for (const level of levels) {
		const orig = (console as unknown as Record<string, unknown>)[level] as (
			...args: unknown[]
		) => void;
		(console as unknown as Record<string, unknown>)[level] = (
			...args: unknown[]
		) => {
			const message = args
				.map((a) => (typeof a === "string" ? a : JSON.stringify(a)))
				.join(" ");
			consoleBuffer.push({ level, message, timestamp: Date.now() });
			if (consoleBuffer.length > 500) consoleBuffer.shift();
			orig(...args);
		};
	}
}

export function patchFetch() {
	const origFetch = window.fetch;
	window.fetch = async (...args: Parameters<typeof window.fetch>) => {
		const entry: NetworkEntry = {
			url: String(args[0]),
			method: "GET",
			start: Date.now(),
			end: 0,
			status: 0,
			responseText: "",
		};
		if (args[1]) {
			entry.method = args[1].method || "GET";
		}
		try {
			const res = await origFetch(...args);
			entry.status = res.status;
			entry.end = Date.now();
			networkBuffer.push(entry);
			if (networkBuffer.length > 100) networkBuffer.shift();
			return res;
		} catch (err) {
			entry.end = Date.now();
			entry.error = String(err);
			networkBuffer.push(entry);
			if (networkBuffer.length > 100) networkBuffer.shift();
			throw err;
		}
	};
}
