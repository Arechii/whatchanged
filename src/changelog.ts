import semver from "semver";

import { fenceReader } from "./fences";
import { isBetween } from "./versions";

const ATX_HEADING = /^#{1,6}\s+(.*)$/;
// Anchors, `<small>`, bold and link brackets wrapped around the version.
const DECORATION = /^(?:<[^>]*>\s*|\*\*|__|\[)+/;
const LABEL = /^(?:version|release)\s+/i;
// `name@1.2.3`, or `name 1.2.3` for a name the caller knows.
const NAMED = /^(?!v?\d)([\w@/.-]+?)(@|\s+v?)(?=\d)/;
const VERSION = /^v?(\d+\.\d+(?:\.\d+)?(?:-[0-9A-Za-z.-]+)?)(?![\w.])/;

const OTHER_PACKAGE = Symbol("another package's version");

function isOneOf(id: string, names: readonly string[]): boolean {
	return names.some(
		(name) => id === name || id === name.slice(name.indexOf("/") + 1),
	);
}

function headingVersion(
	line: string,
	names: readonly string[],
): string | typeof OTHER_PACKAGE | null {
	const heading = ATX_HEADING.exec(line)?.[1];
	if (heading === undefined) return null;
	let text = heading.replace(DECORATION, "").replace(LABEL, "");
	const named = NAMED.exec(text);
	if (named?.[1] !== undefined) {
		if (!isOneOf(named[1], names)) {
			return named[2] === "@" ? OTHER_PACKAGE : null;
		}
		text = text.slice(named[0].length);
	}
	const raw = VERSION.exec(text)?.[1];
	if (raw === undefined) return null;
	return (
		semver.valid(raw) ??
		semver.coerce(raw, { includePrerelease: true })?.version ??
		null
	);
}

/**
 * The sections of a CHANGELOG.md for every version an upgrade from `current`
 * to `latest` passes through, or "" when it has none. In a changelog shared
 * by several packages, `name@1.2.3` sections of packages outside `names` are
 * left out.
 */
export function sliceChangelog(
	markdown: string,
	current: string,
	latest: string,
	names: readonly string[] = [],
): string {
	const kept: string[] = [];
	const fence = fenceReader();
	let keeping = false;
	for (const line of markdown.split(/\r?\n/)) {
		if (fence(line) === "outside") {
			const version = headingVersion(line, names);
			if (version === OTHER_PACKAGE) keeping = false;
			else if (version !== null) {
				keeping = isBetween(version, current, latest);
			}
		}
		if (keeping) kept.push(line);
	}
	return kept.join("\n").trim();
}
