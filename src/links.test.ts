import { describe, expect, it } from "vitest";

import { browsableUrl, linkFor } from "./links";
import type { Group } from "./notes";

const group = (overrides: Partial<Group> = {}): Group => ({
	key: "k",
	names: ["pkg"],
	current: "1.0.0",
	latest: "1.2.0",
	bump: "minor",
	repo: { owner: "o", name: "r", directory: "" },
	directories: [""],
	repositoryUrl: "https://github.com/o/r",
	...overrides,
});

describe("linkFor", () => {
	it("compares from the current tag in the style of the newest one", () => {
		const release = { tag: "pkg@1.2.0", body: "", url: "", version: "1.2.0" };
		expect(
			linkFor(group(), {
				kind: "releases",
				releases: [release],
				truncated: false,
			}),
		).toBe("https://github.com/o/r/compare/pkg@1.0.0...pkg@1.2.0");
	});

	it("points at the changelog file it read", () => {
		expect(
			linkFor(group(), {
				kind: "changelog",
				path: "packages/x/CHANGELOG.md",
				markdown: "",
			}),
		).toBe("https://github.com/o/r/blob/HEAD/packages/x/CHANGELOG.md");
	});

	it("lists the commits to a DefinitelyTyped package", () => {
		expect(
			linkFor(
				group({
					repo: {
						owner: "DefinitelyTyped",
						name: "DefinitelyTyped",
						directory: "types/node",
					},
				}),
				{ kind: "typings" },
			),
		).toBe(
			"https://github.com/DefinitelyTyped/DefinitelyTyped/commits/HEAD/types/node",
		);
	});

	it("falls back to the releases page", () => {
		expect(linkFor(group(), { kind: "missing" })).toBe(
			"https://github.com/o/r/releases",
		);
	});

	it("uses the repository outside GitHub, else the npm page", () => {
		const outside = { repo: null, directories: [] };
		expect(
			linkFor(group({ ...outside, repositoryUrl: "gitlab:o/r" }), {
				kind: "elsewhere",
			}),
		).toBe("https://gitlab.com/o/r");
		expect(
			linkFor(group({ ...outside, repositoryUrl: undefined }), {
				kind: "elsewhere",
			}),
		).toBe("https://www.npmjs.com/package/pkg");
	});
});

describe("browsableUrl", () => {
	it.each([
		["git+https://gitlab.com/o/r.git", "https://gitlab.com/o/r"],
		["git://gitlab.com/o/r.git", "https://gitlab.com/o/r"],
		["git@gitlab.com:o/r.git", "https://gitlab.com/o/r"],
		["git+ssh://git@gitlab.com/o/r.git", "https://gitlab.com/o/r"],
		["bitbucket:o/r", "https://bitbucket.org/o/r"],
		["https://example.com/repo", "https://example.com/repo"],
		[
			"https://gitlab.com/o/g\u001B]52;c;aGVsbG8=\u0007/x",
			"https://gitlab.com/o/g%1B]52;c;aGVsbG8=%07/x",
		],
	])("reads %s", (url, expected) => {
		expect(browsableUrl(url)).toBe(expected);
	});

	it.each([[undefined], ["file:../x"], ["o/r-but-not-a-url"]])(
		"is undefined for %s",
		(url) => {
			expect(browsableUrl(url)).toBeUndefined();
		},
	);
});
