// @vitest-environment jsdom
import { beforeEach, describe, expect, test, vi } from "vitest";
import { TOOL_HANDLERS } from "../src/client/handlers.js";
import type { ApertureClient } from "../src/client.js";

describe("Built-in Tool Handlers", () => {
	let mockClient: Pick<ApertureClient, "captureScreenshotFromStream">;
	let captureScreenshotFromStream: ReturnType<
		typeof vi.fn<() => Promise<string>>
	>;

	beforeEach(() => {
		captureScreenshotFromStream = vi.fn<() => Promise<string>>();
		mockClient = {
			captureScreenshotFromStream,
		};

		document.body.innerHTML = "";
		document.title = "Test Page";

		// Reset location hash/query if any, just keep basic
		Object.defineProperty(window, "location", {
			value: { href: "http://localhost:3000/" },
			writable: true,
		});
	});

	test("browser_dom_query", async () => {
		const div = document.createElement("div");
		div.id = "test-id";
		div.className = "test-class";
		div.textContent = "Hello world";
		div.setAttribute("data-test", "true");
		document.body.appendChild(div);

		const handler = TOOL_HANDLERS.browser_dom_query;
		const result = await handler(mockClient, {
			selector: "#test-id",
			includeHtml: true,
		});

		expect(result).toHaveLength(1);
		expect(result[0].tag).toBe("div");
		expect(result[0].text).toBe("Hello world");
		expect(result[0].attributes["id"]).toBe("test-id");
		expect(result[0].attributes["class"]).toBe("test-class");
		expect(result[0].attributes["data-test"]).toBe("true");
		expect(result[0].html).toContain('<div id="test-id"');
	});

	test("browser_page_info", async () => {
		const handler = TOOL_HANDLERS.browser_page_info;
		const res = await handler(mockClient, {});
		expect(res.url).toBe("http://localhost:3000/");
		expect(res.title).toBe("Test Page");
		expect(res.width).toBeDefined();
		expect(res.height).toBeDefined();
		expect(res.logs).toBeDefined();
		expect(Array.isArray(res.logs)).toBe(true);
	});

	test("browser_storage_get localStorage by key", async () => {
		localStorage.setItem("test-key", "test-val");

		const handler = TOOL_HANDLERS.browser_storage_get;
		const res = await handler(mockClient, {
			type: "localStorage",
			key: "test-key",
		});
		expect(res["test-key"]).toBe("test-val");
	});

	test("browser_storage_get localStorage by prefix", async () => {
		localStorage.setItem("prefix-1", "val1");
		localStorage.setItem("prefix-2", "val2");

		const handler = TOOL_HANDLERS.browser_storage_get;
		const res = await handler(mockClient, {
			type: "localStorage",
			prefix: "prefix-",
		});
		expect(res["prefix-1"]).toBe("val1");
		expect(res["prefix-2"]).toBe("val2");
		expect(res["test-key"]).toBeUndefined();
	});

	test("browser_storage_get cookie", async () => {
		document.cookie = "cookie1=val1; path=/";
		document.cookie = "cookie2=val2; path=/";

		const handler = TOOL_HANDLERS.browser_storage_get;
		const res1 = await handler(mockClient, { type: "cookie" });
		expect(res1["cookie1"]).toBe("val1");
		expect(res1["cookie2"]).toBe("val2");

		const res2 = await handler(mockClient, { type: "cookie", name: "cookie1" });
		expect(res2["cookie1"]).toBe("val1");
		expect(res2["cookie2"]).toBeUndefined();
	});

	test("browser_storage_get unknown type returns error", async () => {
		const handler = TOOL_HANDLERS.browser_storage_get;
		const res = await handler(mockClient, { type: "unknown" });
		expect(res.error).toContain("Unknown type");
	});

	test("browser_screenshot success", async () => {
		captureScreenshotFromStream.mockResolvedValue(
			"data:image/png;base64,iVBORw0KGgo",
		);
		const handler = TOOL_HANDLERS.browser_screenshot;
		const res = await handler(mockClient, {});
		expect(res.base64).toBe("iVBORw0KGgo");
		expect(res.format).toBe("png");
	});

	test("browser_screenshot error", async () => {
		captureScreenshotFromStream.mockRejectedValue(new Error("No stream"));
		const handler = TOOL_HANDLERS.browser_screenshot;
		const res = await handler(mockClient, {});
		expect(res.error).toBe("No stream");
	});

	test("browser_screenshot forwards an optional selector", async () => {
		captureScreenshotFromStream.mockResolvedValue(
			"data:image/png;base64,iVBORw0KGgo",
		);

		await TOOL_HANDLERS.browser_screenshot(mockClient, {
			selector: "#target",
		});

		expect(captureScreenshotFromStream).toHaveBeenCalledWith("#target");
	});

	test("browser_evaluate", async () => {
		Object.defineProperty(window, "testVal", {
			configurable: true,
			value: 42,
		});
		const handler = TOOL_HANDLERS.browser_evaluate;
		const res1 = await handler(mockClient, {
			expression: "window.testVal + 8",
		});
		expect(res1.result).toBe("50");

		const res2 = await handler(mockClient, { expression: "({ a: 1 })" });
		expect(res2.result).toBe('{"a":1}');
	});

	test("browser_click", async () => {
		const btn = document.createElement("button");
		btn.id = "click-btn";
		let clicked = false;
		btn.addEventListener("click", () => {
			clicked = true;
		});
		document.body.appendChild(btn);

		const handler = TOOL_HANDLERS.browser_click;
		const res = await handler(mockClient, { selector: "#click-btn" });

		expect(res.success).toBe(true);
		expect(clicked).toBe(true);

		const notFoundRes = await handler(mockClient, { selector: "#not-found" });
		expect(notFoundRes.error).toBeDefined();
	});

	test("browser_type", async () => {
		const input = document.createElement("input");
		input.id = "type-input";
		document.body.appendChild(input);

		let changed = false;
		input.addEventListener("change", () => {
			changed = true;
		});

		const handler = TOOL_HANDLERS.browser_type;
		const res = await handler(mockClient, {
			selector: "#type-input",
			text: "hello",
		});

		expect(res.success).toBe(true);
		expect(input.value).toBe("hello");
		expect(changed).toBe(true);

		const notFoundRes = await handler(mockClient, {
			selector: "#not-found",
			text: "hello",
		});
		expect(notFoundRes.error).toBeDefined();

		const div = document.createElement("div");
		div.id = "not-input";
		document.body.appendChild(div);
		const errRes = await handler(mockClient, {
			selector: "#not-input",
			text: "hello",
		});
		expect(errRes.error).toContain("Element is not an input");
	});

	test("browser_type on contenteditable", async () => {
		const div = document.createElement("div");
		div.id = "editable-div";
		div.contentEditable = "true";
		Object.defineProperty(div, "isContentEditable", { value: true });
		document.body.appendChild(div);

		const handler = TOOL_HANDLERS.browser_type;
		const res = await handler(mockClient, {
			selector: "#editable-div",
			text: "edited text",
		});

		expect(res.success).toBe(true);
		expect(div.textContent).toBe("edited text");
	});

	test("browser_scroll", async () => {
		const handler = TOOL_HANDLERS.browser_scroll;

		// Window scroll
		let scrollLeft = 0,
			scrollTop = 0;
		const scrollTo = vi
			.spyOn(window, "scrollTo")
			.mockImplementation((options: ScrollToOptions | number, y?: number) => {
				if (typeof options === "number") {
					scrollLeft = options;
					scrollTop = y ?? 0;
				} else {
					scrollLeft = options.left ?? 0;
					scrollTop = options.top ?? 0;
				}
			});

		const res1 = await handler(mockClient, { x: 100, y: 200 });
		expect(res1.success).toBe(true);
		expect(scrollLeft).toBe(100);
		expect(scrollTop).toBe(200);

		// Element scroll
		const div = document.createElement("div");
		div.id = "scroll-div";
		document.body.appendChild(div);

		let intoViewCalled = false;
		div.scrollIntoView = () => {
			intoViewCalled = true;
		};

		const res2 = await handler(mockClient, {
			selector: "#scroll-div",
			x: 50,
			y: 50,
		});
		expect(res2.success).toBe(true);
		expect(div.scrollLeft).toBe(50);
		expect(div.scrollTop).toBe(50);

		const res3 = await handler(mockClient, {
			selector: "#scroll-div",
			scrollIntoView: true,
		});
		expect(res3.success).toBe(true);
		expect(intoViewCalled).toBe(true);

		scrollTo.mockRestore();
	});
});
