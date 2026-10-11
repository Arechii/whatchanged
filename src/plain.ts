import { linkFor } from "./links";
import { cleanMarkdown, demoteHeadings } from "./markdown";
import type { Group, Notes } from "./notes";

const RATE_LIMIT_HINT =
	"GitHub's rate limit was reached. Set GITHUB_TOKEN, or sign in with `gh auth login`, for 5,000 requests an hour.";

/** A group's heading line: its packages and the upgrade they make. */
export function groupTitle(group: Group): string {
	return `${group.names.join(", ")} ${group.current} → ${group.latest}`;
}

/** A group's notes as Markdown, without its title or link. */
export function notesMarkdown(notes: Notes): string {
	switch (notes.kind) {
		case "releases": {
			const sections = notes.releases.map((release) => {
				const text = demoteHeadings(cleanMarkdown(release.body), 4);
				return text ? `### ${release.tag}\n\n${text}` : `### ${release.tag}`;
			});
			if (notes.truncated) {
				sections.push("_Only the newest releases were read._");
			}
			return sections.join("\n\n");
		}
		case "changelog":
			return `_From ${notes.path}_\n\n${demoteHeadings(cleanMarkdown(notes.markdown), 3)}`;
		case "missing":
			return notes.truncated
				? "_No release notes in the newest releases, and older ones were not read._"
				: "_No release notes found._";
		case "typings":
			return "_Type definitions from DefinitelyTyped, which publishes no release notes._";
		case "elsewhere":
			return "_Not on GitHub._";
		case "failed":
			return notes.rateLimited
				? `_${RATE_LIMIT_HINT}_`
				: `_Could not read the notes: ${notes.message}_`;
	}
}

/** Every group's notes as one Markdown document, in the order given. */
export function renderPlain(
	groups: readonly Group[],
	notes: readonly Notes[],
): string {
	const sections = groups.map((group, i) => {
		const groupNotes = notes[i] ?? { kind: "missing", truncated: false };
		return [
			`## ${groupTitle(group)} (${group.bump})`,
			notesMarkdown(groupNotes),
			linkFor(group, groupNotes),
		].join("\n\n");
	});
	return `${sections.join("\n\n")}\n`;
}
