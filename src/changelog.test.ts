import { describe, expect, it } from "vitest";

import { sliceChangelog } from "./changelog";

const lines = (...rows: string[]) => rows.join("\n");

describe("sliceChangelog", () => {
	it("keeps conventional-changelog sections inside the range", () => {
		const markdown = lines(
			"## <small>[8.3.4](https://github.com/vitejs/vite/compare/v8.3.3...v8.3.4) (2026-10-08)</small>",
			"### Bug Fixes",
			"- four",
			"## <small>[8.3.3](https://github.com/vitejs/vite/compare/v8.3.2...v8.3.3) (2026-10-01)</small>",
			"- three",
		);
		expect(sliceChangelog(markdown, "8.3.3", "8.3.4")).toBe(
			lines(
				"## <small>[8.3.4](https://github.com/vitejs/vite/compare/v8.3.3...v8.3.4) (2026-10-08)</small>",
				"### Bug Fixes",
				"- four",
			),
		);
	});

	it("reads changesets headings under a package title", () => {
		const markdown = lines(
			"# @tanstack/react-query",
			"## 5.104.1",
			"### Patch Changes",
			"- fix",
			"## 5.104.0",
			"### Minor Changes",
			"- feature",
			"## 5.103.0",
			"- old",
		);
		expect(sliceChangelog(markdown, "5.103.0", "5.104.1")).toBe(
			lines(
				"## 5.104.1",
				"### Patch Changes",
				"- fix",
				"## 5.104.0",
				"### Minor Changes",
				"- feature",
			),
		);
	});

	it("reads dated headings and skips unreleased sections", () => {
		const markdown = lines(
			"# Changelog",
			"## Unpublished",
			"- not out yet",
			"## 0.13.0 — 2026-09-18",
			"- thirteen",
			"## 19.3.0 (September 9, 2026)",
			"## [Unreleased]",
			"- pending",
			"## [0.12.0] - 2026-08-01",
			"- twelve",
			"## 0.10.1",
		);
		expect(sliceChangelog(markdown, "0.10.1", "0.13.0")).toBe(
			lines(
				"## 0.13.0 — 2026-09-18",
				"- thirteen",
				"## [0.12.0] - 2026-08-01",
				"- twelve",
			),
		);
	});

	it("coerces two-part versions and reads v and name@ prefixes", () => {
		const markdown = lines(
			"### 3.9",
			"- nine",
			"## v3.8.1",
			"- eight",
			"## zod@3.8.0",
			"- old",
		);
		expect(sliceChangelog(markdown, "3.8.0", "3.9.0", ["zod"])).toBe(
			lines("### 3.9", "- nine", "## v3.8.1", "- eight"),
		);
	});

	it("leaves out versions newer than latest", () => {
		const markdown = lines("## 2.0.0-beta.1", "- next", "## 1.1.0", "- now");
		expect(sliceChangelog(markdown, "1.0.0", "1.1.0")).toBe(
			lines("## 1.1.0", "- now"),
		);
	});

	it("does not take a heading that only mentions a version", () => {
		const markdown = lines(
			"## 1.1.0",
			"### Upgrading from 1.0.0",
			"- steps",
			"## 1.0.0",
		);
		expect(sliceChangelog(markdown, "1.0.0", "1.1.0")).toBe(
			lines("## 1.1.0", "### Upgrading from 1.0.0", "- steps"),
		);
	});

	it("reads labelled, named, bold and anchored headings", () => {
		const markdown = lines(
			"## Version 1.1.0",
			"## Release v1.0.5",
			"## my-pkg 1.0.4",
			"## **1.0.3**",
			'## <a name="1.0.2"></a>1.0.2 (2026-01-01)',
			"## 1.0.1 2026-01-01",
			"## 1.0.0",
		);
		expect(sliceChangelog(markdown, "1.0.0", "1.1.0", ["my-pkg"])).toBe(
			lines(
				"## Version 1.1.0",
				"## Release v1.0.5",
				"## my-pkg 1.0.4",
				"## **1.0.3**",
				'## <a name="1.0.2"></a>1.0.2 (2026-01-01)',
				"## 1.0.1 2026-01-01",
			),
		);
	});

	it("keeps only its own packages in a shared changelog", () => {
		const markdown = lines(
			"## @s/a@1.1.0",
			"- a",
			"## @s/b@1.1.0",
			"- b",
			"## @s/b@1.0.0",
		);
		expect(sliceChangelog(markdown, "1.0.0", "1.1.0", ["@s/b"])).toBe(
			lines("## @s/b@1.1.0", "- b"),
		);
	});

	it("ignores headings inside code fences", () => {
		const markdown = lines(
			"## 1.1.0",
			"```sh",
			"# 0.9 compat",
			"```",
			"- after",
			"## 1.0.0",
		);
		expect(sliceChangelog(markdown, "1.0.0", "1.1.0")).toBe(
			lines("## 1.1.0", "```sh", "# 0.9 compat", "```", "- after"),
		);
	});

	it("keeps the prerelease of a two-part version", () => {
		const markdown = lines("## 2.0-rc.1", "- rc", "## 1.5.0", "- stable");
		expect(sliceChangelog(markdown, "1.0.0", "2.0.0")).toBe(
			lines("## 1.5.0", "- stable"),
		);
	});

	it("handles CRLF line endings", () => {
		expect(
			sliceChangelog("## 1.1.0\r\n- now\r\n## 1.0.0\r\n", "1.0.0", "1.1.0"),
		).toBe(lines("## 1.1.0", "- now"));
	});

	it("is empty when nothing is in range", () => {
		expect(
			sliceChangelog("# Changelog\n## 1.0.0\n- old", "1.0.0", "1.1.0"),
		).toBe("");
		expect(sliceChangelog("", "1.0.0", "1.1.0")).toBe("");
	});
});
