import { fenceReader } from "./fences";

const ENTITIES: Record<string, string> = {
	"&nbsp;": " ",
	"&amp;": "&",
	"&lt;": "<",
	"&gt;": ">",
	"&quot;": '"',
	"&#39;": "'",
};

// Every character a terminal acts on rather than prints, except tab and
// newline: C0, DEL and C1 carry all escape sequences, so remote text loses them.
const CONTROL = /(?![\t\n])\p{Cc}/gu;
// An inline code span is matched so it can be kept whole; otherwise only the
// presentational tags release tooling emits, so a `<T>` in prose survives.
const MARKUP =
	/(`+)[^`]*?\1|<\/?(?:a|b|br|code|details|div|em|i|img|kbd|p|picture|samp|small|source|span|strong|sub|summary|sup)\b[^>]*>|&(?:nbsp|amp|lt|gt|quot|#39);/g;
const HEADING = /^(#{1,6})\s+/;

/** Removes `<!-- -->` comments, which can span lines, carrying `open` over. */
function withoutComments(line: string, state: { open: boolean }): string {
	let kept = "";
	let rest = line;
	while (rest !== "") {
		if (state.open) {
			const end = rest.indexOf("-->");
			if (end === -1) return kept;
			rest = rest.slice(end + 3);
			state.open = false;
		} else {
			const start = rest.indexOf("<!--");
			if (start === -1) return kept + rest;
			kept += rest.slice(0, start);
			rest = rest.slice(start + 4);
			state.open = true;
		}
	}
	return kept;
}

function unmark(match: string, ticks: string | undefined): string {
	if (ticks !== undefined) return match;
	return match.startsWith("&") ? (ENTITIES[match] ?? match) : "";
}

/**
 * Release notes as plain terminal text: control characters stripped,
 * entities decoded, comments and presentational HTML dropped outside code,
 * runs of blank lines collapsed.
 */
export function cleanMarkdown(markdown: string): string {
	const kept: string[] = [];
	const fence = fenceReader();
	const comment = { open: false };
	for (const raw of markdown.replace(CONTROL, "").split("\n")) {
		if (fence(raw) !== "outside") {
			kept.push(raw);
			continue;
		}
		const line = withoutComments(raw, comment)
			.replace(MARKUP, unmark)
			.replace(HEADING, "$1 ")
			.trimEnd();
		if (line === "" && kept.at(-1) === "") continue;
		kept.push(line);
	}
	return kept.join("\n").trim();
}

/** Shifts headings so the shallowest one sits at `level`, capped at h6. */
export function demoteHeadings(markdown: string, level: number): string {
	const lines = markdown.split("\n");
	const fence = fenceReader();
	const depths = lines.map((line) =>
		fence(line) === "outside" ? (HEADING.exec(line)?.[1]?.length ?? 0) : 0,
	);
	const shallowest = Math.min(...depths.filter((depth) => depth > 0));
	if (!Number.isFinite(shallowest)) return markdown;
	const shift = level - shallowest;
	return lines
		.map((line, i) => {
			const depth = depths[i] ?? 0;
			if (depth === 0) return line;
			const target = Math.min(6, Math.max(1, depth + shift));
			return "#".repeat(target) + line.slice(depth);
		})
		.join("\n");
}
