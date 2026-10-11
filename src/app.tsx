import type { TextProps } from "ink";
import { Box, Text, useAnimation, useApp, useInput, useWindowSize } from "ink";
import { useEffect, useMemo, useState } from "react";

import { linkFor } from "./links";
import type { Bump, Group, Notes } from "./notes";
import { groupTitle, notesMarkdown } from "./plain";
import type { Line, LineStyle } from "./terminal";
import { clampOffset, statusOf, toLines, windowStart } from "./terminal";

const SPINNER = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

const BUMPS: Record<Bump, { label: string; color: string }> = {
	major: { label: "major", color: "red" },
	minor: { label: "minor", color: "yellow" },
	patch: { label: "patch", color: "green" },
	prerelease: { label: "pre", color: "magenta" },
};

const STATUS_WIDTH = 13;
// Below this the status column would push rows past the terminal's edge.
const MIN_STATUS_COLUMNS = 60;
const LIST_KEYS = "↑↓ move   ⏎ read   o open in browser   q quit";
const DETAIL_KEYS =
	"↑↓ scroll   space page   n/p next/prev   o browser   esc back";

export type AppProps = {
	groups: readonly Group[];
	notesFor: (group: Group) => Promise<Notes>;
	openUrl: (url: string) => void;
	warning?: string | undefined;
};

function useNotes(
	groups: readonly Group[],
	notesFor: AppProps["notesFor"],
): ReadonlyMap<string, Notes> {
	const [notes, setNotes] = useState<ReadonlyMap<string, Notes>>(
		() => new Map(),
	);
	useEffect(() => {
		let active = true;
		const store = (group: Group, found: Notes) => {
			if (active)
				setNotes((previous) => new Map(previous).set(group.key, found));
		};
		for (const group of groups) {
			notesFor(group).then(
				(found) => {
					store(group, found);
				},
				(error: unknown) => {
					store(group, {
						kind: "failed",
						message: error instanceof Error ? error.message : String(error),
						rateLimited: false,
					});
				},
			);
		}
		return () => {
			active = false;
		};
	}, [groups, notesFor]);
	return notes;
}

function Row({
	group,
	notes,
	selected,
	spinner,
	versionWidth,
	showStatus,
}: {
	group: Group;
	notes: Notes | undefined;
	selected: boolean;
	spinner: string;
	versionWidth: number;
	showStatus: boolean;
}) {
	const bump = BUMPS[group.bump];
	return (
		<Box>
			<Box width={2} flexShrink={0}>
				<Text color="cyan">{selected ? "›" : " "}</Text>
			</Box>
			<Box width={6} flexShrink={0}>
				<Text color={bump.color}>{bump.label}</Text>
			</Box>
			<Box flexGrow={1} flexShrink={1}>
				<Text bold={selected} wrap="truncate-end">
					{group.names.join(", ")}
				</Text>
			</Box>
			<Box width={versionWidth} marginLeft={2} flexShrink={0}>
				<Text>{`${group.current} → ${group.latest}`}</Text>
			</Box>
			{showStatus ? (
				<Box
					width={STATUS_WIDTH}
					marginLeft={2}
					flexShrink={0}
					justifyContent="flex-end"
				>
					<Text dimColor>{notes ? statusOf(notes) : spinner}</Text>
				</Box>
			) : null}
		</Box>
	);
}

const LINE_STYLES: Record<LineStyle, TextProps> = {
	title: { bold: true, color: "cyan" },
	heading: { bold: true },
	code: { color: "gray" },
	quote: { dimColor: true, italic: true },
	text: {},
};

function Detail({
	group,
	notes,
	lines,
	offset,
	height,
	spinner,
	flash,
}: {
	group: Group;
	notes: Notes | undefined;
	lines: readonly Line[];
	offset: number;
	height: number;
	spinner: string;
	flash: string | undefined;
}) {
	const bump = BUMPS[group.bump];
	const end = Math.min(lines.length, offset + height);
	const position =
		lines.length > height
			? `lines ${offset + 1}-${end} of ${lines.length}   `
			: "";
	return (
		<Box flexDirection="column">
			<Box>
				<Text color={bump.color}>{`${bump.label} `}</Text>
				<Text bold wrap="truncate-end">
					{groupTitle(group)}
				</Text>
			</Box>
			<Text dimColor wrap="truncate-end">
				{notes ? linkFor(group, notes) : ""}
			</Text>
			{notes ? (
				lines.slice(offset, end).map((line, i) => (
					// Rows are positions in a scrolled window, not identities.
					// oxlint-disable-next-line react/no-array-index-key
					<Text key={i} {...LINE_STYLES[line.style]}>
						{line.text === "" ? " " : line.text}
					</Text>
				))
			) : (
				<Text dimColor>{`${spinner} reading notes`}</Text>
			)}
			<Text dimColor wrap="truncate-end">
				{flash ?? position + DETAIL_KEYS}
			</Text>
		</Box>
	);
}

/** The interactive view: every outdated group, its notes loading in place. */
export function App({ groups, notesFor, openUrl, warning }: AppProps) {
	const { exit } = useApp();
	const { columns, rows } = useWindowSize();
	const notes = useNotes(groups, notesFor);
	const loading = notes.size < groups.length;
	const { frame } = useAnimation({ interval: 80, isActive: loading });
	const [cursor, setCursor] = useState(0);
	const [reading, setReading] = useState(false);
	const [offset, setOffset] = useState(0);
	const [flash, setFlash] = useState<string>();

	const selected = groups[cursor];
	const selectedNotes = selected ? notes.get(selected.key) : undefined;
	const lines = useMemo(
		() =>
			selectedNotes ? toLines(notesMarkdown(selectedNotes), columns - 1) : [],
		[selectedNotes, columns],
	);

	// Header and footer, plus a spare row: output as tall as the terminal
	// makes ink redraw the whole screen on every spinner frame.
	const height = Math.max(3, rows - 3 - (warning ? 1 : 0));
	const pageHeight = Math.max(3, rows - 4);
	const last = groups.length - 1;
	const moveTo = (index: number) => {
		setCursor(Math.max(0, Math.min(last, index)));
	};
	// A resize can shorten the content under a scroll position held earlier.
	const shown = clampOffset(offset, lines.length, pageHeight);
	const scrollTo = (line: number) => {
		setOffset(clampOffset(line, lines.length, pageHeight));
	};
	const read = (index: number) => {
		moveTo(index);
		setOffset(0);
		setReading(true);
	};

	useInput((input, key) => {
		setFlash(undefined);
		if (input === "o" && selected) {
			const url = linkFor(
				selected,
				selectedNotes ?? { kind: "missing", truncated: false },
			);
			openUrl(url);
			setFlash(`Opening ${url}`);
			return;
		}
		if (reading) {
			if (input === "q" || key.escape || key.leftArrow || input === "h") {
				setReading(false);
			} else if (key.upArrow || input === "k") scrollTo(shown - 1);
			else if (key.downArrow || input === "j") scrollTo(shown + 1);
			else if (key.pageUp || input === "b") scrollTo(shown - pageHeight);
			else if (key.pageDown || input === " " || input === "f") {
				scrollTo(shown + pageHeight);
			} else if (key.home || input === "g") scrollTo(0);
			else if (key.end || input === "G") scrollTo(lines.length);
			else if (input === "n" && cursor < last) read(cursor + 1);
			else if (input === "p" && cursor > 0) read(cursor - 1);
			return;
		}
		if (input === "q" || key.escape) exit();
		else if (key.return || key.rightArrow || input === "l") read(cursor);
		else if (key.upArrow || input === "k") moveTo(cursor - 1);
		else if (key.downArrow || input === "j") moveTo(cursor + 1);
		else if (key.pageUp) moveTo(cursor - height);
		else if (key.pageDown) moveTo(cursor + height);
		else if (key.home || input === "g") moveTo(0);
		else if (key.end || input === "G") moveTo(last);
	});

	const spinner = SPINNER[frame % SPINNER.length] ?? "";
	if (reading && selected) {
		return (
			<Detail
				group={selected}
				notes={selectedNotes}
				lines={lines}
				offset={shown}
				height={pageHeight}
				spinner={spinner}
				flash={flash}
			/>
		);
	}

	const start = windowStart(cursor, groups.length, height);
	const versionWidth = Math.max(
		...groups.map((group) => `${group.current} → ${group.latest}`.length),
	);
	const majors = groups.filter((group) => group.bump === "major").length;

	return (
		<Box flexDirection="column">
			<Text wrap="truncate-end">
				<Text bold>whatchanged</Text>
				{`  ${groups.length} outdated`}
				{majors > 0 ? <Text color="red">{`, ${majors} major`}</Text> : null}
				{loading ? (
					<Text
						dimColor
					>{`  ${spinner} reading notes ${notes.size}/${groups.length}`}</Text>
				) : null}
			</Text>
			{warning ? (
				<Text color="yellow" wrap="truncate-end">
					{warning}
				</Text>
			) : null}
			{groups.slice(start, start + height).map((group, i) => (
				<Row
					key={group.key}
					group={group}
					notes={notes.get(group.key)}
					selected={start + i === cursor}
					spinner={spinner}
					versionWidth={versionWidth}
					showStatus={columns >= MIN_STATUS_COLUMNS}
				/>
			))}
			<Text dimColor wrap="truncate-end">
				{flash ?? LIST_KEYS}
			</Text>
		</Box>
	);
}
