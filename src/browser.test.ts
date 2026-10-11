import { describe, expect, it } from "vitest";

import { browserCommand } from "./browser";

describe("browserCommand", () => {
	const url = "https://github.com/o/r/compare/v1.0.0...v1.1.0";

	it("uses each platform's opener", () => {
		expect(browserCommand(url, "darwin")).toEqual(["open", [url]]);
		expect(browserCommand(url, "win32")).toEqual(["explorer.exe", [url]]);
		expect(browserCommand(url, "linux")).toEqual(["xdg-open", [url]]);
	});

	it.each([
		["-a Calculator"],
		["file:///etc/passwd"],
		["mailto:someone@example.com"],
	])("refuses %s", (value) => {
		expect(browserCommand(value, "darwin")).toBeNull();
	});
});
