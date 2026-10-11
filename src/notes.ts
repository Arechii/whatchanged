import { readFile } from "node:fs/promises";
import { join } from "node:path";

import semver from "semver";

import { sliceChangelog } from "./changelog";
import type { Fetch, GitHub, Release } from "./github";
import { limit, RateLimitError } from "./github";
import type { Outdated } from "./outdated";
import type { GitHubRepo } from "./repo";
import { parseRepo, repositoryUrl } from "./repo";
import { isBetween, prefixedVersion, tagVersion } from "./versions";

export type Bump = "major" | "minor" | "patch" | "prerelease";

/** Outdated packages that share a repo and a version range, read as one. */
export type Group = {
	key: string;
	names: string[];
	current: string;
	latest: string;
	bump: Bump;
	repo: GitHubRepo | null;
	/** Where each package lives in the repo, for its CHANGELOG.md. */
	directories: string[];
	repositoryUrl: string | undefined;
};

type VersionedRelease = Release & { version: string };

export type Notes =
	| { kind: "releases"; releases: VersionedRelease[]; truncated: boolean }
	| { kind: "changelog"; path: string; markdown: string }
	| { kind: "missing"; truncated: boolean }
	| { kind: "typings" }
	| { kind: "elsewhere" }
	| { kind: "failed"; message: string; rateLimited: boolean };

const BUMP_ORDER: Bump[] = ["major", "minor", "patch", "prerelease"];
const REGISTRY_REQUESTS = 8;
const REGISTRY_TIMEOUT_MS = 20_000;

function bumpOf(current: string, latest: string): Bump {
	const diff = semver.diff(current, latest);
	if (diff === "major" || diff === "premajor") return "major";
	if (diff === "minor" || diff === "preminor") return "minor";
	if (diff === "patch" || diff === "prepatch") return "patch";
	return "prerelease";
}

type Sources = {
	fetch: Fetch;
	read?: (path: string) => Promise<string>;
};

const readText = (path: string) => readFile(path, "utf8");

async function repositoryOf(
	dependency: Outdated,
	{ fetch, read = readText }: Sources,
	run: ReturnType<typeof limit>,
): Promise<unknown> {
	for (const location of dependency.locations) {
		try {
			const path = join(
				location,
				"node_modules",
				dependency.name,
				"package.json",
			);
			const manifest: unknown = JSON.parse(await read(path));
			if (
				typeof manifest === "object" &&
				manifest !== null &&
				"repository" in manifest
			) {
				return manifest.repository;
			}
		} catch {
			// Not installed there; the next location or the registry answers.
		}
	}
	try {
		const response = await run(() =>
			fetch(
				`https://registry.npmjs.org/${dependency.name}/${dependency.latest}`,
				{ signal: AbortSignal.timeout(REGISTRY_TIMEOUT_MS) },
			),
		);
		if (!response.ok) return undefined;
		const manifest: unknown = await response.json();
		return typeof manifest === "object" &&
			manifest !== null &&
			"repository" in manifest
			? manifest.repository
			: undefined;
	} catch {
		return undefined;
	}
}

/**
 * Finds each dependency's repo and merges the ones that share a repo and a
 * version range, majors first.
 */
export async function findGroups(
	outdated: readonly Outdated[],
	sources: Sources,
): Promise<Group[]> {
	const run = limit(REGISTRY_REQUESTS);
	const resolved = await Promise.all(
		outdated.map(async (dependency) => {
			const repository = await repositoryOf(dependency, sources, run);
			return { dependency, repository, repo: parseRepo(repository) };
		}),
	);
	const groups = new Map<string, Group>();
	for (const { dependency, repository, repo } of resolved) {
		const { name, current, latest } = dependency;
		const key = repo
			? `${repo.owner}/${repo.name} ${current} ${latest}`.toLowerCase()
			: name;
		const group = groups.get(key);
		if (group) {
			group.names.push(name);
			if (repo && !group.directories.includes(repo.directory)) {
				group.directories.push(repo.directory);
			}
			continue;
		}
		groups.set(key, {
			key,
			names: [name],
			current,
			latest,
			bump: bumpOf(current, latest),
			repo,
			directories: repo ? [repo.directory] : [],
			repositoryUrl: repositoryUrl(repository),
		});
	}
	return [...groups.values()].toSorted(
		(a, b) =>
			BUMP_ORDER.indexOf(a.bump) - BUMP_ORDER.indexOf(b.bump) ||
			(a.names[0] ?? "").localeCompare(b.names[0] ?? ""),
	);
}

const namesItself = (releases: readonly Release[], names: readonly string[]) =>
	releases.some((release) => prefixedVersion(release.tag, names) !== null);

/**
 * Whether paging, newest-created first, has gone past `current`. A release at
 * or below it on its own major line says so; a lower one alone does not,
 * since a backport to an old major can be created after the whole range.
 */
export function hasPassed(
	versions: readonly string[],
	current: string,
): boolean {
	const onLine = versions.some(
		(version) =>
			semver.lte(version, current) &&
			semver.major(version) === semver.major(current),
	);
	const allOlder =
		versions.length > 0 &&
		versions.every((version) => semver.lte(version, current));
	return onLine || allOlder;
}

function releasesBetween(
	releases: readonly Release[],
	group: Group,
): VersionedRelease[] {
	const bare = !namesItself(releases, group.names);
	const inRange = releases.flatMap((release) => {
		const version = tagVersion(release.tag, group.names, bare);
		return version !== null && isBetween(version, group.current, group.latest)
			? [{ ...release, version }]
			: [];
	});
	return inRange.toSorted((a, b) => semver.rcompare(a.version, b.version));
}

/**
 * The notes for a group: its GitHub releases in range, else the matching
 * CHANGELOG.md sections, nearest the package first.
 */
export async function findNotes(group: Group, github: GitHub): Promise<Notes> {
	const { repo, names, current, latest } = group;
	if (!repo) return { kind: "elsewhere" };
	// One repo of type packages, with no releases or changelogs to read.
	if (repo.owner.toLowerCase() === "definitelytyped")
		return { kind: "typings" };
	try {
		let named = false;
		const { releases, truncated } = await github.releases(repo, (page) => {
			named ||= namesItself(page, names);
			const versions = page.flatMap(
				(release) => tagVersion(release.tag, names, !named) ?? [],
			);
			return hasPassed(versions, current);
		});
		const inRange = releasesBetween(releases, group);
		if (inRange.length > 0) {
			return { kind: "releases", releases: inRange, truncated };
		}
		// ponytail: only CHANGELOG.md; add HISTORY.md or CHANGES.md if users ask.
		for (const directory of new Set([...group.directories, ""])) {
			const path = directory ? `${directory}/CHANGELOG.md` : "CHANGELOG.md";
			const file = await github.file(repo, path);
			const markdown =
				file === null ? "" : sliceChangelog(file, current, latest, names);
			if (markdown) return { kind: "changelog", path, markdown };
		}
		return { kind: "missing", truncated };
	} catch (error) {
		return {
			kind: "failed",
			message: error instanceof Error ? error.message : String(error),
			rateLimited: error instanceof RateLimitError,
		};
	}
}
