import { describe, expect, it } from "vitest";

import { clampOffset, statusOf, toLines, windowStart } from "./terminal";

describe("toLines", () => {
	it("styles headings and drops their hashes", () => {
		expect(toLines("### v1.2.0\n#### Fixes\n- one", 80)).toEqual([
			{ text: "v1.2.0", style: "title" },
			{ text: "Fixes", style: "heading" },
			{ text: "- one", style: "text" },
		]);
	});

	it("keeps link text and drops targets, images and bold markers", () => {
		expect(
			toLines(
				"- **core**: fix [#123](https://github.com/o/r/pull/123) ![badge](https://x/y.svg) <https://example.com>",
				200,
			),
		).toEqual([
			{ text: "- core: fix #123  https://example.com", style: "text" },
		]);
	});

	it("unwraps a fully emphasized line but not snake_case", () => {
		expect(
			toLines("_No release notes found._\nuse some_snake_case", 80),
		).toEqual([
			{ text: "No release notes found.", style: "text" },
			{ text: "use some_snake_case", style: "text" },
		]);
	});

	it("indents code blocks and leaves their content alone", () => {
		expect(toLines("~~~ts\nconst a = [b](c);\n\tx\n~~~\n> quoted", 80)).toEqual(
			[
				{ text: "  const a = [b](c);", style: "code" },
				{ text: "    x", style: "code" },
				{ text: "> quoted", style: "quote" },
			],
		);
	});

	it("hangs wrapped list items under their text", () => {
		expect(
			toLines("- one two three four", 12).map((line) => line.text),
		).toEqual(["- one two ", "  three four"]);
	});

	it("wraps to the width and keeps blank lines", () => {
		expect(toLines("aaaa bbbb cccc\n\nd", 10).map((line) => line.text)).toEqual(
			["aaaa bbbb ", "cccc", "", "d"],
		);
	});
});

describe("statusOf", () => {
	it("counts releases and names the other outcomes", () => {
		const release = { tag: "v1", body: "", url: "", version: "1.0.0" };
		expect(statusOf(undefined)).toBe("");
		expect(
			statusOf({ kind: "releases", releases: [release], truncated: false }),
		).toBe("1 release");
		expect(
			statusOf({
				kind: "releases",
				releases: [release, release],
				truncated: true,
			}),
		).toBe("2+ releases");
		expect(statusOf({ kind: "changelog", path: "", markdown: "" })).toBe(
			"changelog",
		);
		expect(statusOf({ kind: "missing" })).toBe("no notes");
		expect(statusOf({ kind: "typings" })).toBe("type defs");
		expect(statusOf({ kind: "failed", message: "", rateLimited: true })).toBe(
			"rate limited",
		);
	});
});

describe("windowStart", () => {
	it("keeps the cursor near the middle without running past either end", () => {
		expect(windowStart(0, 100, 10)).toBe(0);
		expect(windowStart(50, 100, 10)).toBe(45);
		expect(windowStart(99, 100, 10)).toBe(90);
		expect(windowStart(3, 5, 10)).toBe(0);
	});
});

describe("clampOffset", () => {
	it("keeps the last page full and never goes below the top", () => {
		expect(clampOffset(222, 62, 20)).toBe(42);
		expect(clampOffset(-3, 62, 20)).toBe(0);
		expect(clampOffset(5, 10, 20)).toBe(0);
		expect(clampOffset(7, 62, 20)).toBe(7);
	});
});
