// @vitest-environment jsdom
import { beforeEach, describe, expect, test, vi } from "vitest";
import { storage } from "../src/client/storage.js";

describe("storage", () => {
	beforeEach(() => {
		localStorage.clear();
		vi.restoreAllMocks();
	});

	test("reads, writes, and removes values", () => {
		storage.set("key", "value");

		expect(storage.get("key")).toBe("value");

		storage.remove("key");
		expect(storage.get("key")).toBeNull();
	});

	test("returns null when reading storage fails", () => {
		vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
			throw new Error("storage unavailable");
		});

		expect(storage.get("key")).toBeNull();
	});

	test("swallows storage write and remove failures", () => {
		vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
			throw new Error("storage unavailable");
		});
		vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
			throw new Error("storage unavailable");
		});

		expect(() => storage.set("key", "value")).not.toThrow();
		expect(() => storage.remove("key")).not.toThrow();
	});
});
