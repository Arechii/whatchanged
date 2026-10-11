import { describe, expect, it } from "vitest";

import { parseRepo, repositoryUrl } from "./repo";

describe("parseRepo", () => {
	it.each([
		["git+https://github.com/o/r.git", "o", "r"],
		["https://github.com/o/r", "o", "r"],
		["https://github.com/o/r/", "o", "r"],
		["https://github.com/o/r#readme", "o", "r"],
		["https://www.github.com/o/r", "o", "r"],
		["git://github.com/o/r.git", "o", "r"],
		["git@github.com:o/r.git", "o", "r"],
		["git+ssh://git@github.com/o/r.git", "o", "r"],
		["github:o/r", "o", "r"],
		["o/r", "o", "r"],
		["https://github.com/vercel/next.js", "vercel", "next.js"],
		["git+https://github.com/vercel/next.js.git", "vercel", "next.js"],
		["  https://github.com/o/r  ", "o", "r"],
	])("reads %s", (url, owner, name) => {
		expect(parseRepo(url)).toEqual({ owner, name, directory: "" });
	});

	it("keeps the monorepo directory of the object form", () => {
		expect(
			parseRepo({
				type: "git",
				url: "git+https://github.com/middleapi/orpc.git",
				directory: "packages/server",
			}),
		).toEqual({
			owner: "middleapi",
			name: "orpc",
			directory: "packages/server",
		});
	});

	it("normalizes the directory", () => {
		expect(
			parseRepo({ url: "https://github.com/o/r", directory: "./packages/x/" }),
		).toEqual({ owner: "o", name: "r", directory: "packages/x" });
	});

	it.each([["../../other/repo"], ["packages/x\u001B[2J"], ["a b"]])(
		"drops the unsafe directory %j",
		(directory) => {
			expect(parseRepo({ url: "https://github.com/o/r", directory })).toEqual({
				owner: "o",
				name: "r",
				directory: "",
			});
		},
	);

	it("reads the directory from a tree URL", () => {
		expect(
			parseRepo("https://github.com/babel/babel/tree/main/packages/babel-core"),
		).toEqual({
			owner: "babel",
			name: "babel",
			directory: "packages/babel-core",
		});
	});

	it.each([
		["gitlab:o/r"],
		["bitbucket:o/r"],
		["https://gitlab.com/o/r"],
		["https://notgithub.com/o/r"],
		["https://github.com/o"],
		[""],
	])("is null for %s", (url) => {
		expect(parseRepo(url)).toBeNull();
	});

	it.each([[undefined], [null], [42], [{}], [{ url: 42 }]])(
		"is null for the value %j",
		(value) => {
			expect(parseRepo(value)).toBeNull();
		},
	);
});

describe("repositoryUrl", () => {
	it("reads both shapes", () => {
		expect(repositoryUrl("gitlab:o/r")).toBe("gitlab:o/r");
		expect(repositoryUrl({ url: "https://gitlab.com/o/r" })).toBe(
			"https://gitlab.com/o/r",
		);
		expect(repositoryUrl({ type: "git" })).toBeUndefined();
	});
});
