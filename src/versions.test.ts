import { describe, expect, it } from "vitest";

import { isBetween, tagVersion } from "./versions";

describe("tagVersion", () => {
	it.each([
		["v1.15.5", ["@orpc/client"], "1.15.5"],
		["1.0.11", ["@napi-rs/canvas"], "1.0.11"],
		["v16.5.0-canary.8", ["next"], "16.5.0-canary.8"],
		["@tanstack/react-query@5.90.0", ["@tanstack/react-query"], "5.90.0"],
		["react-query@5.90.0", ["@tanstack/react-query"], "5.90.0"],
		["@orpc/server@1.0.0", ["@orpc/client", "@orpc/server"], "1.0.0"],
		["hono@4.0.0", ["hono"], "4.0.0"],
		["foo/v1.0.0", ["foo"], "1.0.0"],
		["foo-v2.0.0", ["foo"], "2.0.0"],
		["@scope/foo-v2.0.0", ["@scope/foo"], "2.0.0"],
	])("reads %s for %j", (tag, names, version) => {
		expect(tagVersion(tag, names)).toBe(version);
	});

	it.each([
		["@tanstack/angular-query@5.0.0-rc.1", ["@tanstack/react-query"]],
		["@hono/vercel@1.0.1", ["hono"]],
		["vscode-typescript/v1.0.1", ["typescript"]],
		["react-dom@19.3.0", ["react"]],
		["release-2026-10-03-2018", ["@tanstack/react-query"]],
		["latest", ["foo"]],
		["", ["foo"]],
	])("is null for %s against %j", (tag, names) => {
		expect(tagVersion(tag, names)).toBeNull();
	});
});

describe("tagVersion without bare tags", () => {
	it("reads only tags that name the package", () => {
		expect(tagVersion("v7.0.0", ["@vitejs/plugin-legacy"], false)).toBeNull();
		expect(
			tagVersion("plugin-legacy@7.0.0", ["@vitejs/plugin-legacy"], false),
		).toBe("7.0.0");
	});
});

describe("isBetween", () => {
	it("excludes current and includes latest", () => {
		expect(isBetween("1.0.0", "1.0.0", "1.2.0")).toBe(false);
		expect(isBetween("1.1.0", "1.0.0", "1.2.0")).toBe(true);
		expect(isBetween("1.2.0", "1.0.0", "1.2.0")).toBe(true);
		expect(isBetween("1.3.0", "1.0.0", "1.2.0")).toBe(false);
	});

	it("skips prereleases between two stable versions", () => {
		expect(isBetween("1.1.0-canary.3", "1.0.0", "1.2.0")).toBe(false);
	});

	it("keeps prereleases when the upgrade starts or ends on one", () => {
		expect(isBetween("2.0.0-rc.2", "2.0.0-rc.1", "2.0.0")).toBe(true);
		expect(isBetween("2.0.0-rc.1", "1.9.0", "2.0.0-rc.2")).toBe(true);
	});

	it("keeps only the prereleases on the line of the prerelease end", () => {
		expect(isBetween("15.0.0-rc.2", "15.0.0-rc.1", "16.0.0")).toBe(true);
		expect(isBetween("16.0.0-canary.3", "15.0.0-rc.1", "16.0.0")).toBe(false);
		expect(isBetween("15.1.0", "15.0.0-rc.1", "16.0.0")).toBe(true);
	});
});
