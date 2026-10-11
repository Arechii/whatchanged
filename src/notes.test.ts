import { describe, expect, it } from "vitest";

import type { Fetch, GitHub, Release } from "./github";
import { RateLimitError } from "./github";
import type { Group } from "./notes";
import { findGroups, findNotes, hasPassed } from "./notes";
import type { Outdated } from "./outdated";

const dependency = (
	name: string,
	current: string,
	latest: string,
): Outdated => ({ name, current, latest, locations: ["/repo"] });

const manifests: Record<string, unknown> = {
	"/repo/node_modules/@orpc/client/package.json": {
		repository: {
			url: "git+https://github.com/middleapi/orpc.git",
			directory: "packages/client",
		},
	},
	"/repo/node_modules/@orpc/server/package.json": {
		repository: {
			url: "git+https://github.com/middleapi/orpc.git",
			directory: "packages/server",
		},
	},
	"/repo/node_modules/react/package.json": {
		repository: "https://github.com/facebook/react",
	},
	"/repo/node_modules/gitlab-thing/package.json": {
		repository: "https://gitlab.com/o/gitlab-thing",
	},
};

const read = async (path: string) => {
	const manifest = manifests[path];
	if (manifest === undefined) throw new Error(`ENOENT ${path}`);
	return JSON.stringify(manifest);
};

const registry: Fetch = async (url) =>
	url === "https://registry.npmjs.org/not-installed/2.0.0"
		? new Response(
				JSON.stringify({
					repository: "git+https://github.com/o/not-installed.git",
				}),
			)
		: new Response("{}", { status: 404 });

describe("findGroups", () => {
	it("merges packages that share a repo and a range", async () => {
		const groups = await findGroups(
			[
				dependency("@orpc/client", "1.15.4", "1.15.5"),
				dependency("@orpc/server", "1.15.4", "1.15.5"),
			],
			{ fetch: registry, read },
		);
		expect(groups).toEqual([
			{
				key: "middleapi/orpc 1.15.4 1.15.5",
				names: ["@orpc/client", "@orpc/server"],
				current: "1.15.4",
				latest: "1.15.5",
				bump: "patch",
				repo: {
					owner: "middleapi",
					name: "orpc",
					directory: "packages/client",
				},
				directories: ["packages/client", "packages/server"],
				repositoryUrl: "git+https://github.com/middleapi/orpc.git",
			},
		]);
	});

	it("keeps different ranges of one repo apart", async () => {
		const groups = await findGroups(
			[
				dependency("@orpc/client", "1.15.4", "1.15.5"),
				dependency("@orpc/server", "1.14.0", "1.15.5"),
			],
			{ fetch: registry, read },
		);
		expect(groups.map((group) => group.names)).toEqual([
			["@orpc/server"],
			["@orpc/client"],
		]);
	});

	it("falls back to the registry, and keeps non-GitHub URLs", async () => {
		const groups = await findGroups(
			[
				dependency("not-installed", "1.0.0", "2.0.0"),
				dependency("gitlab-thing", "1.0.0", "1.1.0"),
				dependency("unknown", "1.0.0", "1.0.1"),
			],
			{ fetch: registry, read },
		);
		expect(
			groups.map(({ names, repo, repositoryUrl }) => ({
				names,
				repo,
				repositoryUrl,
			})),
		).toEqual([
			{
				names: ["not-installed"],
				repo: { owner: "o", name: "not-installed", directory: "" },
				repositoryUrl: "git+https://github.com/o/not-installed.git",
			},
			{
				names: ["gitlab-thing"],
				repo: null,
				repositoryUrl: "https://gitlab.com/o/gitlab-thing",
			},
			{ names: ["unknown"], repo: null, repositoryUrl: undefined },
		]);
	});

	it("tries each location and survives a registry that throws", async () => {
		const groups = await findGroups(
			[
				{
					...dependency("react", "19.2.8", "19.3.0"),
					locations: ["/elsewhere", "/repo"],
				},
				dependency("offline", "1.0.0", "1.0.1"),
			],
			{
				fetch: () => Promise.reject(new TypeError("fetch failed")),
				read,
			},
		);
		expect(groups.map(({ names, repo }) => [names[0], repo?.name])).toEqual([
			["react", "react"],
			["offline", undefined],
		]);
	});

	it("sorts majors first, then by name", async () => {
		const groups = await findGroups(
			[
				dependency("react", "19.2.8", "19.3.0"),
				dependency("z-patch", "1.0.0", "1.0.1"),
				dependency("a-patch", "1.0.0", "1.0.1"),
				dependency("not-installed", "1.0.0", "2.0.0"),
			],
			{ fetch: registry, read },
		);
		expect(groups.map((group) => [group.names[0], group.bump])).toEqual([
			["not-installed", "major"],
			["react", "minor"],
			["a-patch", "patch"],
			["z-patch", "patch"],
		]);
	});
});

const group = (overrides: Partial<Group> = {}): Group => ({
	key: "k",
	names: ["pkg"],
	current: "1.0.0",
	latest: "1.2.0",
	bump: "minor",
	repo: { owner: "o", name: "r", directory: "packages/pkg" },
	directories: ["packages/pkg"],
	repositoryUrl: "https://github.com/o/r",
	...overrides,
});

const release = (tag: string): Release => ({
	tag,
	body: `notes for ${tag}`,
	url: `https://github.com/o/r/releases/tag/${tag}`,
});

function fakeGitHub(
	releases: Release[],
	files: Record<string, string> = {},
): GitHub & { asked: string[] } {
	const asked: string[] = [];
	return {
		asked,
		releases: async (_repo, isDone) => ({
			releases,
			truncated: !isDone(releases),
		}),
		file: async (_repo, path) => {
			asked.push(path);
			return files[path] ?? null;
		},
	};
}

describe("hasPassed", () => {
	it("stops on a release at or below current on its major line", () => {
		expect(hasPassed(["5.1.0", "5.0.0", "4.9.0"], "5.0.0")).toBe(true);
	});

	it("keeps going past a backport to an older major", () => {
		expect(hasPassed(["6.0.0-canary.1", "4.17.99"], "5.0.0")).toBe(false);
	});

	it("stops on a page with nothing newer than current", () => {
		expect(hasPassed(["4.9.0", "4.8.0"], "5.0.0")).toBe(true);
		expect(hasPassed([], "5.0.0")).toBe(false);
	});
});

describe("findNotes", () => {
	it("returns the releases in range, newest first", async () => {
		const github = fakeGitHub([
			release("v1.3.0"),
			release("v1.2.0"),
			release("v1.1.0-beta.1"),
			release("v1.1.0"),
			release("v1.0.0"),
		]);
		expect(await findNotes(group(), github)).toEqual({
			kind: "releases",
			releases: [
				{ ...release("v1.2.0"), version: "1.2.0" },
				{ ...release("v1.1.0"), version: "1.1.0" },
			],
			truncated: false,
		});
	});

	it("ignores bare tags in a repo that names its packages in tags", async () => {
		const github = fakeGitHub([
			release("v7.0.0"),
			release("plugin-legacy@7.0.0"),
			release("v6.2.0"),
			release("other@6.5.0"),
			release("plugin-legacy@6.1.1"),
		]);
		const notes = await findNotes(
			group({
				names: ["@vitejs/plugin-legacy"],
				current: "6.1.1",
				latest: "7.0.0",
			}),
			github,
		);
		expect(notes).toEqual({
			kind: "releases",
			releases: [{ ...release("plugin-legacy@7.0.0"), version: "7.0.0" }],
			truncated: false,
		});
	});

	it("keeps each grouped package's release for a shared version", async () => {
		const github = fakeGitHub([
			release("@tanstack/query-core@5.90.0"),
			release("@tanstack/react-query@5.90.0"),
			release("@tanstack/react-query@5.89.0"),
		]);
		const notes = await findNotes(
			group({
				names: ["@tanstack/query-core", "@tanstack/react-query"],
				current: "5.89.0",
				latest: "5.90.0",
			}),
			github,
		);
		expect(
			notes.kind === "releases" && notes.releases.map((r) => r.tag),
		).toEqual(["@tanstack/query-core@5.90.0", "@tanstack/react-query@5.90.0"]);
	});

	it("passes its names to the changelog, leaving siblings' sections out", async () => {
		const github = fakeGitHub([], {
			"CHANGELOG.md":
				"## other@1.2.0\n- theirs\n## pkg@1.2.0\n- ours\n## pkg@1.0.0",
		});
		expect(await findNotes(group({ directories: [""] }), github)).toEqual({
			kind: "changelog",
			path: "CHANGELOG.md",
			markdown: "## pkg@1.2.0\n- ours",
		});
	});

	it("falls back to the package's CHANGELOG.md, then the root's", async () => {
		const github = fakeGitHub([release("release-2026-10-03")], {
			"packages/pkg/CHANGELOG.md": "## 1.0.0\n- old",
			"CHANGELOG.md": "## 1.2.0\n- new\n## 1.0.0",
		});
		expect(await findNotes(group(), github)).toEqual({
			kind: "changelog",
			path: "CHANGELOG.md",
			markdown: "## 1.2.0\n- new",
		});
		expect(github.asked).toEqual(["packages/pkg/CHANGELOG.md", "CHANGELOG.md"]);
	});

	it("is missing when neither source has the range", async () => {
		expect(await findNotes(group(), fakeGitHub([]))).toEqual({
			kind: "missing",
		});
	});

	it("does not look for packages outside GitHub", async () => {
		expect(
			await findNotes(group({ repo: null, directories: [] }), fakeGitHub([])),
		).toEqual({ kind: "elsewhere" });
	});

	it("reports failures and whether they were the rate limit", async () => {
		const github = fakeGitHub([]);
		github.releases = () => Promise.reject(new RateLimitError(null));
		expect(await findNotes(group(), github)).toEqual({
			kind: "failed",
			message: "GitHub rate limit reached",
			rateLimited: true,
		});
	});
});
