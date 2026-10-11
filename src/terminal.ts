import wrapAnsi from "wrap-ansi";

import { fenceReader } from "./fences";
import type { Notes } from "./notes";

export type LineStyle = "title" | "heading" | "code" | "quote" | "text";

/** One terminal row of notes, already wrapped to the width it was made for. */
export type Line = { text: string; style: LineStyle };

const HEADING = /^(#{1,6})\s+(.*)$/;
const IMAGE = /!\[[^\]]*\]\([^)]*\)/g;
const LINK = /\[([^\]]*)\]\([^)]*\)/g;
const AUTOLINK = /<(https?:\/\/[^>]+)>/g;
const STRONG = /(\*\*|__)(.+?)\1/g;
const EMPHASIZED_LINE = /^_(.+)_$/;

// Link targets are what makes release notes unreadable in a terminal, and
// the browser key opens the page they point into.
function simplify(line: string): string {
	return line
		.replace(IMAGE, "")
		.replace(LINK, "$1")
		.replace(AUTOLINK, "$1")
		.replace(STRONG, "$2")
		.replace(EMPHASIZED_LINE, "$1");
}

const HANGING = /^\s*(?:[-*+]\s+|\d+[.)]\s+)?/;

// Continuation rows line up under the text of a list item or indented line.
function wrap(text: string, width: number): string[] {
	if (text === "") return [""];
	const hang = Math.min(
		HANGING.exec(text)?.[0].length ?? 0,
		Math.floor(width / 2),
	);
	const [first = "", ...rest] = wrapAnsi(text, width - hang, {
		hard: true,
		trim: false,
	}).split("\n");
	return [first, ...rest.map((line) => " ".repeat(hang) + line.trimStart())];
}

/** Markdown as styled terminal rows, wrapped to `width` columns. */
export function toLines(markdown: string, width: number): Line[] {
	const columns = Math.max(10, width);
	const lines: Line[] = [];
	const fence = fenceReader();
	for (const raw of markdown.split("\n")) {
		const position = fence(raw);
		if (position === "marker") continue;
		let style: LineStyle = "text";
		let text: string;
		if (position === "inside") {
			style = "code";
			text = `  ${raw.replaceAll("\t", "  ")}`;
		} else {
			const heading = HEADING.exec(raw);
			if (heading?.[1] !== undefined && heading[2] !== undefined) {
				style = heading[1].length <= 3 ? "title" : "heading";
				text = simplify(heading[2]);
			} else {
				if (raw.startsWith(">")) style = "quote";
				text = simplify(raw);
			}
		}
		for (const piece of wrap(text, columns)) lines.push({ text: piece, style });
	}
	return lines;
}

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
		case "typings":
			return "type defs";
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

/** A scroll offset kept inside content of `total` rows shown `height` at a time. */
export function clampOffset(
	offset: number,
	total: number,
	height: number,
): number {
	return Math.max(0, Math.min(offset, total - height));
}
