import { Box, Text, useAnimation, useApp, useInput, useWindowSize } from "ink";
import { useEffect, useState } from "react";

import type { Bump, Group, Notes } from "./notes";
import { statusOf, windowStart } from "./terminal";

const SPINNER = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

const BUMPS: Record<Bump, { label: string; color: string }> = {
	major: { label: "major", color: "red" },
	minor: { label: "minor", color: "yellow" },
	patch: { label: "patch", color: "green" },
	prerelease: { label: "pre", color: "magenta" },
};

const STATUS_WIDTH = 13;
const LIST_KEYS = "↑↓ move   q quit";

export type AppProps = {
	groups: readonly Group[];
	notesFor: (group: Group) => Promise<Notes>;
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
}: {
	group: Group;
	notes: Notes | undefined;
	selected: boolean;
	spinner: string;
	versionWidth: number;
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
			<Box flexGrow={1} flexShrink={1} minWidth={8}>
				<Text bold={selected} wrap="truncate-end">
					{group.names.join(", ")}
				</Text>
			</Box>
			<Box width={versionWidth} marginLeft={2} flexShrink={0}>
				<Text>{`${group.current} → ${group.latest}`}</Text>
			</Box>
			<Box
				width={STATUS_WIDTH}
				marginLeft={2}
				flexShrink={0}
				justifyContent="flex-end"
			>
				<Text dimColor>{notes ? statusOf(notes) : spinner}</Text>
			</Box>
		</Box>
	);
}

/** The interactive view: every outdated group, its notes loading in place. */
export function App({ groups, notesFor, warning }: AppProps) {
	const { exit } = useApp();
	const { rows } = useWindowSize();
	const notes = useNotes(groups, notesFor);
	const loading = notes.size < groups.length;
	const { frame } = useAnimation({ interval: 80, isActive: loading });
	const [cursor, setCursor] = useState(0);

	// Header and footer, plus a spare row: output as tall as the terminal
	// makes ink redraw the whole screen on every spinner frame.
	const height = Math.max(3, rows - 3 - (warning ? 1 : 0));
	const last = groups.length - 1;
	const moveTo = (index: number) => {
		setCursor(Math.max(0, Math.min(last, index)));
	};

	useInput((input, key) => {
		if (input === "q" || key.escape) exit();
		else if (key.upArrow || input === "k") moveTo(cursor - 1);
		else if (key.downArrow || input === "j") moveTo(cursor + 1);
		else if (key.pageUp) moveTo(cursor - height);
		else if (key.pageDown) moveTo(cursor + height);
		else if (key.home || input === "g") moveTo(0);
		else if (key.end || input === "G") moveTo(last);
	});

	const start = windowStart(cursor, groups.length, height);
	const versionWidth = Math.max(
		...groups.map((group) => `${group.current} → ${group.latest}`.length),
	);
	const majors = groups.filter((group) => group.bump === "major").length;
	const spinner = SPINNER[frame % SPINNER.length] ?? "";

	return (
		<Box flexDirection="column">
			<Box>
				<Text bold>whatchanged</Text>
				<Text>{`  ${groups.length} outdated`}</Text>
				{majors > 0 ? <Text color="red">{`, ${majors} major`}</Text> : null}
				{loading ? (
					<Text
						dimColor
					>{`  ${spinner} reading notes ${notes.size}/${groups.length}`}</Text>
				) : null}
			</Box>
			{warning ? <Text color="yellow">{warning}</Text> : null}
			{groups.slice(start, start + height).map((group, i) => (
				<Row
					key={group.key}
					group={group}
					notes={notes.get(group.key)}
					selected={start + i === cursor}
					spinner={spinner}
					versionWidth={versionWidth}
				/>
			))}
			<Text dimColor>{LIST_KEYS}</Text>
		</Box>
	);
}
