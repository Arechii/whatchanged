import type { Notes } from "./notes";

/** A short word on what was found for a group, for the list. */
export function statusOf(notes: Notes | undefined): string {
	if (notes === undefined) return "";
	switch (notes.kind) {
		case "releases": {
			const count = notes.releases.length;
			const more = notes.truncated ? "+" : "";
			return `${count}${more} release${count === 1 && !more ? "" : "s"}`;
		}
		case "changelog":
			return "changelog";
		case "missing":
			return "no notes";
		case "elsewhere":
			return "not on GitHub";
		case "failed":
			return notes.rateLimited ? "rate limited" : "failed";
	}
}

/** The first row to show so the cursor stays in a `height`-row window. */
export function windowStart(
	cursor: number,
	count: number,
	height: number,
): number {
	const centered = cursor - Math.floor(height / 2);
	return Math.max(0, Math.min(centered, count - height));
}
