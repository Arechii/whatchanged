const FENCE = /^ {0,3}(`{3,}|~{3,})/;

/** Where a line sits relative to fenced code blocks. */
export type FencePosition = "marker" | "inside" | "outside";

/**
 * A reader that, fed a document's lines in order, says which are fence
 * markers, which are code inside a fence, and which are prose.
 */
export function fenceReader(): (line: string) => FencePosition {
	let open: string | null = null;
	return (line) => {
		const marker = FENCE.exec(line)?.[1];
		if (marker !== undefined) {
			if (open === null) {
				open = marker;
				return "marker";
			}
			// Only a run of the same character, at least as long, closes it.
			if (open.startsWith(marker.charAt(0)) && marker.length >= open.length) {
				open = null;
				return "marker";
			}
		}
		return open === null ? "outside" : "inside";
	};
}
