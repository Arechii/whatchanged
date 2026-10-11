import semver from "semver";

const SEPARATORS = ["@", "/", "-"];

/** The version in a tag that names one of `names`, like `pkg@1.2.3`. */
export function prefixedVersion(
	tag: string,
	names: readonly string[],
): string | null {
	for (const name of names) {
		const unscoped = name.slice(name.indexOf("/") + 1);
		for (const id of new Set([name, unscoped])) {
			for (const separator of SEPARATORS) {
				if (!tag.startsWith(id + separator)) continue;
				const version = semver.valid(tag.slice(id.length + separator.length));
				if (version !== null) return version;
			}
		}
	}
	return null;
}

/**
 * The version a release tag names for one of `names`, or null when it names
 * another package or no version. A bare `v1.2.3` counts unless `bare` is
 * false, as it must be in a repo whose tags name their packages: there a bare
 * tag belongs to the main package, not to its siblings.
 */
export function tagVersion(
	tag: string,
	names: readonly string[],
	bare = true,
): string | null {
	return prefixedVersion(tag, names) ?? (bare ? semver.valid(tag) : null);
}

const core = (version: string) =>
	`${semver.major(version)}.${semver.minor(version)}.${semver.patch(version)}`;

/**
 * Whether an upgrade from `current` to `latest` passes through `version`.
 * A prerelease counts only on the line of an end that is itself one, so
 * leaving 15.0.0-rc.1 does not pull in every 16.0.0 canary.
 */
export function isBetween(
	version: string,
	current: string,
	latest: string,
): boolean {
	if (semver.prerelease(version) !== null) {
		const onLineOf = (end: string) =>
			semver.prerelease(end) !== null && core(end) === core(version);
		if (!onLineOf(current) && !onLineOf(latest)) return false;
	}
	return semver.gt(version, current) && semver.lte(version, latest);
}
