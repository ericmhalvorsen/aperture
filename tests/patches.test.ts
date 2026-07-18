// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
	getConsoleBuffer,
	getNetworkBuffer,
	patchConsole,
	patchFetch,
} from "../src/client/patches.js";

describe("client patches", () => {
	const originalConsole = {
		log: console.log,
		warn: console.warn,
		error: console.error,
		info: console.info,
		debug: console.debug,
	};
	let originalFetch: typeof window.fetch;

	beforeEach(() => {
		getConsoleBuffer().length = 0;
		getNetworkBuffer().length = 0;
		originalFetch = window.fetch;
	});

	afterEach(() => {
		Object.assign(console, originalConsole);
		window.fetch = originalFetch;
	});

	test("captures console level, message, and timestamp", () => {
		console.log = vi.fn();
		patchConsole();

		console.warn("hello", { count: 2 });

		const entry = getConsoleBuffer()[0];
		expect(entry.level).toBe("warn");
		expect(entry.message).toBe('hello {"count":2}');
		expect(entry.timestamp).toEqual(expect.any(Number));
	});

	test("keeps only the most recent 500 console entries", () => {
		console.log = vi.fn();
		patchConsole();

		for (let index = 0; index < 501; index++) {
			console.log(String(index));
		}

		expect(getConsoleBuffer()).toHaveLength(500);
		expect(getConsoleBuffer()[0].message).toBe("1");
	});

	test("captures successful fetches with method and status", async () => {
		const fetchMock = vi
			.fn<typeof window.fetch>()
			.mockResolvedValue(new Response(null, { status: 201 }));
		window.fetch = fetchMock;
		patchFetch();

		await window.fetch("/api/items", { method: "POST" });

		expect(getNetworkBuffer()[0]).toMatchObject({
			url: "/api/items",
			method: "POST",
			status: 201,
		});
		expect(getNetworkBuffer()[0].end).toBeGreaterThanOrEqual(
			getNetworkBuffer()[0].start,
		);
	});

	test("records and rethrows failed fetches", async () => {
		const fetchMock = vi
			.fn<typeof window.fetch>()
			.mockRejectedValue(new Error("offline"));
		window.fetch = fetchMock;
		patchFetch();

		await expect(window.fetch("/api/items")).rejects.toThrow("offline");
		expect(getNetworkBuffer()[0]).toMatchObject({
			url: "/api/items",
			method: "GET",
			error: "Error: offline",
		});
	});

	test("keeps only the most recent 100 network entries", async () => {
		const fetchMock = vi
			.fn<typeof window.fetch>()
			.mockResolvedValue(new Response(null, { status: 200 }));
		window.fetch = fetchMock;
		patchFetch();

		await Promise.all(
			Array.from({ length: 101 }, (_, index) => window.fetch(`/api/${index}`)),
		);

		expect(getNetworkBuffer()).toHaveLength(100);
		expect(getNetworkBuffer()[0].url).toBe("/api/1");
	});
});
