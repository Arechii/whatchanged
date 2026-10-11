import { setTimeout as sleep } from "node:timers/promises";

import { describe, expect, it } from "vitest";

import type { Fetch } from "./github";
import { createGitHub, findToken, limit, RateLimitError } from "./github";

const repo = { owner: "o", name: "r", directory: "" };

const release = (tag: string, extra: Record<string, unknown> = {}) => ({
	tag_name: tag,
	body: `notes for ${tag}`,
	html_url: `https://github.com/o/r/releases/tag/${tag}`,
	draft: false,
	...extra,
});

/** A fetch that answers from `routes` and records every URL it was asked. */
function fakeFetch(routes: Record<string, () => Response>) {
	const calls: { url: string; init: RequestInit | undefined }[] = [];
	const fetch: Fetch = async (url, init) => {
		calls.push({ url, init });
		const route = routes[url];
		return route ? route() : new Response("not found", { status: 404 });
	};
	return { fetch, calls };
}

const releasesUrl = (page: number) =>
	`https://api.github.com/repos/o/r/releases?per_page=100&page=${page}`;

const json = (body: unknown, init?: ResponseInit) =>
	new Response(JSON.stringify(body), init);

const fullPage = (from: number) =>
	Array.from({ length: 100 }, (_, i) => release(`v${from - i}.0.0`));

describe("releases", () => {
	it("maps releases and drops drafts", async () => {
		const { fetch } = fakeFetch({
			[releasesUrl(1)]: () =>
				json([
					release("v2.0.0", { draft: true }),
					release("v1.1.0", { body: null }),
					release("v1.0.0"),
					{ name: "no tag" },
				]),
		});
		const github = createGitHub({ fetch, token: undefined });
		expect(await github.releases(repo, () => false)).toEqual({
			releases: [
				{
					tag: "v1.1.0",
					body: "",
					url: "https://github.com/o/r/releases/tag/v1.1.0",
				},
				{
					tag: "v1.0.0",
					body: "notes for v1.0.0",
					url: "https://github.com/o/r/releases/tag/v1.0.0",
				},
			],
			truncated: false,
		});
	});

	it("pages until a release older than the range turns up", async () => {
		const { fetch, calls } = fakeFetch({
			[releasesUrl(1)]: () => json(fullPage(300)),
			[releasesUrl(2)]: () => json(fullPage(200)),
			[releasesUrl(3)]: () => json(fullPage(100)),
		});
		const github = createGitHub({ fetch, token: undefined });
		const { releases, truncated } = await github.releases(repo, (page) =>
			page.some((r) => r.tag === "v150.0.0"),
		);
		expect(releases).toHaveLength(200);
		expect(truncated).toBe(false);
		expect(calls).toHaveLength(2);
	});

	it("stops at the page cap and says so", async () => {
		const routes = Object.fromEntries(
			Array.from({ length: 6 }, (_, i) => [
				releasesUrl(i + 1),
				() => json(fullPage(1000 - i * 100)),
			]),
		);
		const { fetch, calls } = fakeFetch(routes);
		const github = createGitHub({ fetch, token: undefined });
		const { releases, truncated } = await github.releases(repo, () => false);
		expect(releases).toHaveLength(500);
		expect(truncated).toBe(true);
		expect(calls).toHaveLength(5);
	});

	it("fetches each page once for every caller", async () => {
		const { fetch, calls } = fakeFetch({
			[releasesUrl(1)]: () => json([release("v1.0.0")]),
		});
		const github = createGitHub({ fetch, token: undefined });
		await Promise.all([
			github.releases(repo, () => false),
			github.releases(repo, () => false),
		]);
		expect(calls).toHaveLength(1);
	});

	it("treats a missing repo as having no releases", async () => {
		const { fetch } = fakeFetch({});
		const github = createGitHub({ fetch, token: undefined });
		expect(await github.releases(repo, () => false)).toEqual({
			releases: [],
			truncated: false,
		});
	});

	it("throws a RateLimitError with the reset time", async () => {
		const { fetch } = fakeFetch({
			[releasesUrl(1)]: () =>
				json(
					{ message: "API rate limit exceeded" },
					{
						status: 403,
						headers: {
							"x-ratelimit-remaining": "0",
							"x-ratelimit-reset": "1800000000",
						},
					},
				),
		});
		const github = createGitHub({ fetch, token: undefined });
		const error: unknown = await github
			.releases(repo, () => false)
			.catch((caught: unknown) => caught);
		expect(error).toBeInstanceOf(RateLimitError);
		expect((error as RateLimitError).resetAt).toEqual(
			new Date(1_800_000_000_000),
		);
	});

	it("treats a secondary rate limit as a rate limit", async () => {
		const { fetch } = fakeFetch({
			[releasesUrl(1)]: () =>
				json(
					{ message: "You have exceeded a secondary rate limit" },
					{ status: 403, headers: { "retry-after": "60" } },
				),
		});
		const github = createGitHub({ fetch, token: "t0k" });
		await expect(github.releases(repo, () => false)).rejects.toBeInstanceOf(
			RateLimitError,
		);
	});

	it("says when GitHub rejects the token", async () => {
		const { fetch } = fakeFetch({
			[releasesUrl(1)]: () =>
				json({ message: "Bad credentials" }, { status: 401 }),
		});
		const github = createGitHub({ fetch, token: "expired" });
		await expect(github.releases(repo, () => false)).rejects.toThrow(
			"GitHub rejected the token",
		);
	});

	it("throws on other errors", async () => {
		const { fetch } = fakeFetch({
			[releasesUrl(1)]: () => new Response("", { status: 500 }),
		});
		const github = createGitHub({ fetch, token: undefined });
		await expect(github.releases(repo, () => false)).rejects.toThrow("500");
	});

	it("sends the token only when there is one", async () => {
		const { fetch, calls } = fakeFetch({
			[releasesUrl(1)]: () => json([]),
		});
		await createGitHub({ fetch, token: "t0k" }).releases(repo, () => false);
		await createGitHub({ fetch, token: undefined }).releases(repo, () => false);
		const auth = calls.map((call) =>
			new Headers(call.init?.headers).get("authorization"),
		);
		expect(auth).toEqual(["Bearer t0k", null]);
	});
});

describe("file", () => {
	it("reads a raw file at HEAD, or null when absent", async () => {
		const { fetch } = fakeFetch({
			"https://raw.githubusercontent.com/o/r/HEAD/packages/x/CHANGELOG.md":
				() => new Response("## 1.0.0"),
		});
		const github = createGitHub({ fetch, token: "t0k" });
		expect(await github.file(repo, "packages/x/CHANGELOG.md")).toBe("## 1.0.0");
		expect(await github.file(repo, "CHANGELOG.md")).toBeNull();
	});

	it("throws when the raw host fails or limits", async () => {
		const base = "https://raw.githubusercontent.com/o/r/HEAD/";
		const { fetch } = fakeFetch({
			[`${base}broken.md`]: () => new Response("", { status: 500 }),
			[`${base}limited.md`]: () => new Response("", { status: 429 }),
		});
		const github = createGitHub({ fetch, token: undefined });
		await expect(github.file(repo, "broken.md")).rejects.toThrow("500");
		await expect(github.file(repo, "limited.md")).rejects.toBeInstanceOf(
			RateLimitError,
		);
	});

	it("gives every request a timeout", async () => {
		const { fetch, calls } = fakeFetch({ [releasesUrl(1)]: () => json([]) });
		const github = createGitHub({ fetch, token: undefined });
		await github.releases(repo, () => false);
		await github.file(repo, "CHANGELOG.md");
		expect(
			calls.map((call) => call.init?.signal instanceof AbortSignal),
		).toEqual([true, true]);
	});
});

describe("limit", () => {
	it("never runs more than the maximum at once", async () => {
		const run = limit(2);
		let active = 0;
		let peak = 0;
		const task = async () => {
			active++;
			peak = Math.max(peak, active);
			await sleep(1);
			active--;
		};
		await Promise.all(Array.from({ length: 10 }, () => run(task)));
		expect(peak).toBe(2);
	});

	it("frees the slot when a task throws", async () => {
		const run = limit(1);
		await expect(run(() => Promise.reject(new Error("boom")))).rejects.toThrow(
			"boom",
		);
		expect(await run(async () => "next")).toBe("next");
	});
});

describe("findToken", () => {
	const noGh = () => Promise.reject(new Error("gh not installed"));

	it("prefers GITHUB_TOKEN, then GH_TOKEN", async () => {
		expect(await findToken({ GITHUB_TOKEN: "a", GH_TOKEN: "b" }, noGh)).toBe(
			"a",
		);
		expect(await findToken({ GH_TOKEN: "b" }, noGh)).toBe("b");
	});

	it("falls back to the GitHub CLI", async () => {
		expect(await findToken({ GITHUB_TOKEN: "" }, async () => "from-gh\n")).toBe(
			"from-gh",
		);
	});

	it("is undefined without either", async () => {
		expect(await findToken({}, noGh)).toBeUndefined();
		expect(await findToken({}, async () => "  \n")).toBeUndefined();
	});
});
