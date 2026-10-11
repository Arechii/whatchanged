import { execFile } from "node:child_process";

import type { GitHubRepo } from "./repo";

export type Fetch = (url: string, init?: RequestInit) => Promise<Response>;

/** One published GitHub release, as much of it as the notes need. */
export type Release = {
	tag: string;
	body: string;
	url: string;
};

/** The releases read for a repo, and whether paging stopped before the end. */
export type Releases = {
	releases: Release[];
	truncated: boolean;
};

/** GitHub refused a request because the hourly allowance is spent. */
export class RateLimitError extends Error {
	readonly resetAt: Date | null;

	constructor(resetAt: Date | null) {
		super("GitHub rate limit reached");
		this.name = "RateLimitError";
		this.resetAt = resetAt;
	}
}

const PER_PAGE = 100;
const MAX_PAGES = 5;
const MAX_REQUESTS = 6;
const TIMEOUT_MS = 20_000;

/** Runs at most `max` tasks at once; the rest wait their turn in order. */
export function limit(max: number) {
	let active = 0;
	const waiting: (() => void)[] = [];
	return async <T>(task: () => Promise<T>): Promise<T> => {
		if (active < max) active++;
		else {
			await new Promise<void>((resolve) => {
				waiting.push(resolve);
			});
		}
		try {
			return await task();
		} finally {
			// A finished task hands its slot straight to the next one.
			const next = waiting.shift();
			if (next) next();
			else active--;
		}
	};
}

function toRelease(value: unknown): Release | null {
	if (typeof value !== "object" || value === null) return null;
	const { tag_name, body, html_url, draft } = value as Record<string, unknown>;
	if (typeof tag_name !== "string" || typeof html_url !== "string") return null;
	if (draft === true) return null;
	return {
		tag: tag_name,
		body: typeof body === "string" ? body : "",
		url: html_url,
	};
}

// The primary limit sets remaining to 0; a secondary one sends retry-after.
function rateLimited(response: Response): RateLimitError | null {
	const spent =
		response.status === 429 ||
		(response.status === 403 &&
			(response.headers.get("x-ratelimit-remaining") === "0" ||
				response.headers.has("retry-after")));
	if (!spent) return null;
	const reset = Number(response.headers.get("x-ratelimit-reset"));
	return new RateLimitError(reset > 0 ? new Date(reset * 1000) : null);
}

type Page = { releases: Release[]; last: boolean };

/** Reads releases and repo files from GitHub, sharing pages between callers. */
export function createGitHub({
	fetch,
	token,
}: {
	fetch: Fetch;
	token: string | undefined;
}) {
	const run = limit(MAX_REQUESTS);
	const pages = new Map<string, Promise<Page>>();
	const headers: Record<string, string> = {
		accept: "application/vnd.github+json",
		"user-agent": "whatchanged",
		"x-github-api-version": "2022-11-28",
	};
	if (token !== undefined) headers.authorization = `Bearer ${token}`;

	async function loadPage(repo: GitHubRepo, n: number): Promise<Page> {
		const path = `/repos/${repo.owner}/${repo.name}/releases?per_page=${PER_PAGE}&page=${n}`;
		const response = await run(() =>
			fetch(`https://api.github.com${path}`, {
				headers,
				signal: AbortSignal.timeout(TIMEOUT_MS),
			}),
		);
		if (response.status === 404) return { releases: [], last: true };
		const limited = rateLimited(response);
		if (limited) throw limited;
		if (response.status === 401) {
			throw new Error(
				"GitHub rejected the token. Check GITHUB_TOKEN, or run `gh auth status`.",
			);
		}
		if (!response.ok) {
			throw new Error(`GitHub answered ${response.status} for ${path}`);
		}
		const body: unknown = await response.json();
		const list = Array.isArray(body) ? body : [];
		return {
			releases: list.map(toRelease).filter((r) => r !== null),
			last: list.length < PER_PAGE,
		};
	}

	function page(repo: GitHubRepo, n: number): Promise<Page> {
		const key = `${repo.owner}/${repo.name}#${n}`;
		let pending = pages.get(key);
		if (!pending) {
			pending = loadPage(repo, n);
			pages.set(key, pending);
		}
		return pending;
	}

	return {
		/**
		 * The repo's releases, newest first, paging until `isDone` holds for a
		 * page or the page cap is hit.
		 */
		async releases(
			repo: GitHubRepo,
			isDone: (page: readonly Release[]) => boolean,
		): Promise<Releases> {
			const releases: Release[] = [];
			for (let n = 1; n <= MAX_PAGES; n++) {
				const { releases: found, last } = await page(repo, n);
				releases.push(...found);
				if (last || isDone(found)) {
					return { releases, truncated: false };
				}
			}
			return { releases, truncated: true };
		},

		/** A file at the tip of the default branch, or null when it is absent. */
		async file(repo: GitHubRepo, path: string): Promise<string | null> {
			const url = `https://raw.githubusercontent.com/${repo.owner}/${repo.name}/HEAD/${path}`;
			const response = await run(() =>
				fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) }),
			);
			if (response.status === 404) return null;
			const limited = rateLimited(response);
			if (limited) throw limited;
			if (!response.ok) {
				throw new Error(`GitHub answered ${response.status} for ${url}`);
			}
			return response.text();
		},
	};
}

export type GitHub = ReturnType<typeof createGitHub>;

function ghAuthToken(): Promise<string> {
	return new Promise((resolve, reject) => {
		// Without a hostname gh answers for its default host, which can be an
		// Enterprise server whose token must not go to api.github.com.
		execFile(
			"gh",
			["auth", "token", "--hostname", "github.com"],
			{ timeout: 5000 },
			(error, stdout) => {
				if (error) reject(new Error("gh auth token failed", { cause: error }));
				else resolve(stdout);
			},
		);
	});
}

/** A token from the environment, else from the GitHub CLI, else none. */
export async function findToken(
	env: NodeJS.ProcessEnv = process.env,
	gh: () => Promise<string> = ghAuthToken,
): Promise<string | undefined> {
	const fromEnv = env.GITHUB_TOKEN || env.GH_TOKEN;
	if (fromEnv) return fromEnv;
	try {
		return (await gh()).trim() || undefined;
	} catch {
		return undefined;
	}
}
