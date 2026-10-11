import { describe, expect, it } from "vitest";

import { cleanMarkdown, demoteHeadings } from "./markdown";

describe("cleanMarkdown", () => {
	it("cleans what changelogithub emits", () => {
		expect(
			cleanMarkdown(
				[
					"### &nbsp;&nbsp;&nbsp;🐞 Bug Fixes",
					"",
					"- **openapi**: Give path params precedence &nbsp;-&nbsp; by @dinwwwh [<samp>(0754c)</samp>](https://github.com/middleapi/orpc/commit/0754ca6b)",
					"",
					"",
					"",
					"##### &nbsp;&nbsp;&nbsp;&nbsp;[View changes on GitHub](https://github.com/middleapi/orpc/compare/v1.15.4...v1.15.5)",
				].join("\n"),
			),
		).toBe(
			[
				"### 🐞 Bug Fixes",
				"",
				"- **openapi**: Give path params precedence  -  by @dinwwwh [(0754c)](https://github.com/middleapi/orpc/commit/0754ca6b)",
				"",
				"##### [View changes on GitHub](https://github.com/middleapi/orpc/compare/v1.15.4...v1.15.5)",
			].join("\n"),
		);
	});

	it("drops comments and presentational tags but keeps generics", () => {
		expect(
			cleanMarkdown(
				"<!-- Release notes generated -->\n## <small>1.0.0</small>\nUse `useState<string>` and Map<K, V>",
			),
		).toBe("## 1.0.0\nUse `useState<string>` and Map<K, V>");
	});

	it("strips terminal control sequences, CRs included", () => {
		expect(
			cleanMarkdown(
				"hi \u001B]52;c;Zm9v\u0007 there\u001B[2J\r\n- x\u009B31m\ty",
			),
		).toBe("hi ]52;c;Zm9v there[2J\n- x31m\ty");
	});

	it("keeps inline code whole", () => {
		expect(
			cleanMarkdown(
				"Support `<source>` inside `<picture>`, fix `<a>` &amp; <b>bold</b>",
			),
		).toBe("Support `<source>` inside `<picture>`, fix `<a>` & bold");
	});

	it("removes comments across lines but not inside fences", () => {
		expect(
			cleanMarkdown(
				"a <!-- one\ntwo --> b\n```html\n<!-- keep me -->\n```\n~~~\n<p>&amp;</p>\n~~~",
			),
		).toBe("a\n b\n```html\n<!-- keep me -->\n```\n~~~\n<p>&amp;</p>\n~~~");
	});

	it("leaves code fences alone", () => {
		const fence = "```html\n<p>&amp;</p>\n\n\n```";
		expect(cleanMarkdown(`<p>a</p>\n${fence}`)).toBe(`a\n${fence}`);
	});
});

describe("demoteHeadings", () => {
	it("moves the shallowest heading to the level", () => {
		expect(demoteHeadings("## What's Changed\n- x\n### Fixes", 4)).toBe(
			"#### What's Changed\n- x\n##### Fixes",
		);
	});

	it("caps at h6 and ignores code fences", () => {
		expect(demoteHeadings("# A\n```sh\n# comment\n```\n###### B", 3)).toBe(
			"### A\n```sh\n# comment\n```\n###### B",
		);
	});

	it("leaves text without headings as it is", () => {
		expect(demoteHeadings("- just a list", 4)).toBe("- just a list");
	});
});
