import { describe, expect, it } from "vitest";

import type { Group } from "./notes";
import { renderPlain } from "./plain";

const group = (overrides: Partial<Group> = {}): Group => ({
	key: "k",
	names: ["@orpc/client", "@orpc/server"],
	current: "1.15.4",
	latest: "1.15.5",
	bump: "patch",
	repo: { owner: "middleapi", name: "orpc", directory: "" },
	directories: [""],
	repositoryUrl: "https://github.com/middleapi/orpc",
	...overrides,
});

describe("renderPlain", () => {
	it("prints releases under the group with a compare link", () => {
		expect(
			renderPlain(
				[group()],
				[
					{
						kind: "releases",
						releases: [
							{
								tag: "v1.15.5",
								body: "## &nbsp;Fixes\n\n- one",
								url: "",
								version: "1.15.5",
							},
						],
						truncated: true,
					},
				],
			),
		).toBe(
			[
				"## @orpc/client, @orpc/server 1.15.4 → 1.15.5 (patch)",
				"",
				"### v1.15.5",
				"",
				"#### Fixes",
				"",
				"- one",
				"",
				"_Only the newest releases were read._",
				"",
				"https://github.com/middleapi/orpc/compare/v1.15.4...v1.15.5",
				"",
			].join("\n"),
		);
	});

	it("prints changelog sections and the other outcomes", () => {
		const output = renderPlain(
			[group(), group(), group({ repo: null }), group()],
			[
				{
					kind: "changelog",
					path: "CHANGELOG.md",
					markdown: "## 1.15.5\n- fix",
				},
				{ kind: "missing" },
				{ kind: "elsewhere" },
				{
					kind: "failed",
					message: "GitHub rate limit reached",
					rateLimited: true,
				},
			],
		);
		expect(output).toContain("_From CHANGELOG.md_\n\n### 1.15.5\n- fix");
		expect(output).toContain("_No release notes found._");
		expect(output).toContain("_Not on GitHub._");
		expect(output).toContain("Set GITHUB_TOKEN");
	});
});
