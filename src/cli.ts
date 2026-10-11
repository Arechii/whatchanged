#!/usr/bin/env node
import { resolve } from "node:path";
import { parseArgs } from "node:util";

import { render } from "ink";
import { createElement } from "react";

import manifest from "../package.json" with { type: "json" };
import { App } from "./app";
import { openUrl } from "./browser";
import { createGitHub, findToken } from "./github";
import { findGroups, findNotes } from "./notes";
import { readOutdated } from "./outdated";
import { renderPlain } from "./plain";

const HELP = `Usage: whatchanged [options] [package...]

Shows the release notes between the installed and the latest version of
every outdated dependency in a pnpm workspace. Name packages to see only those.

In a terminal the notes open in an interactive view; piped or with --plain
they print as Markdown.

Options:
  --cwd <dir>      Workspace to read (default: the current directory)
  --plain          Print Markdown even in a terminal
  -v, --version    Print the version
  -h, --help       Print this help

Environment:
  GITHUB_TOKEN     Raises GitHub's limit from 60 to 5,000 requests an hour.
                   Without it, the token of a signed-in GitHub CLI is used.
`;

const PROGRESS = "Reading outdated dependencies…";
let progressShown = false;

function clearProgress(): void {
	if (progressShown) process.stderr.write("\r\u001B[2K");
	progressShown = false;
	process.off("SIGINT", interrupted);
}

function interrupted(): void {
	clearProgress();
	process.exit(130);
}

async function main(): Promise<void> {
	const { values, positionals } = parseArgs({
		allowPositionals: true,
		options: {
			cwd: { type: "string" },
			plain: { type: "boolean" },
			version: { type: "boolean", short: "v" },
			help: { type: "boolean", short: "h" },
		},
	});
	if (values.help) {
		process.stdout.write(HELP);
		return;
	}
	if (values.version) {
		process.stdout.write(`${manifest.version}\n`);
		return;
	}

	const interactive =
		values.plain !== true && process.stdout.isTTY && process.stdin.isTTY;
	const cwd = resolve(values.cwd ?? process.cwd());
	if (interactive) {
		process.stderr.write(PROGRESS);
		progressShown = true;
		process.once("SIGINT", interrupted);
	}
	const outdated = (await readOutdated(cwd)).filter(
		(dependency) =>
			positionals.length === 0 || positionals.includes(dependency.name),
	);
	const unknown = positionals.filter(
		(name) => !outdated.some((dependency) => dependency.name === name),
	);
	if (unknown.length > 0 || outdated.length === 0) clearProgress();
	for (const name of unknown) {
		process.stderr.write(`${name} is not outdated, or not a dependency.\n`);
	}
	if (outdated.length === 0) {
		process.stderr.write("Nothing to show: every dependency is up to date.\n");
		return;
	}

	const token = await findToken();
	const warning =
		token === undefined
			? "No GitHub token, so GitHub allows 60 requests an hour. Set GITHUB_TOKEN or run `gh auth login`."
			: undefined;
	const github = createGitHub({ fetch, token });
	const groups = await findGroups(outdated, { fetch });

	if (interactive) {
		clearProgress();
		const view = render(
			createElement(App, {
				groups,
				notesFor: (group) => findNotes(group, github),
				openUrl,
				warning,
			}),
			{ alternateScreen: true },
		);
		await view.waitUntilExit();
		// Notes still loading would hold the process open on a closed view.
		process.exit(0);
	}

	if (warning !== undefined) process.stderr.write(`${warning}\n`);
	const notes = await Promise.all(
		groups.map((group) => findNotes(group, github)),
	);
	process.stdout.write(renderPlain(groups, notes));
}

// `whatchanged | head` closes the pipe before the notes end, which is fine.
process.stdout.on("error", (error: NodeJS.ErrnoException) => {
	if (error.code !== "EPIPE") throw error;
	process.exit(0);
});

main().catch((error: unknown) => {
	clearProgress();
	process.stderr.write(
		`whatchanged: ${error instanceof Error ? error.message : String(error)}\n`,
	);
	process.exitCode = 1;
});
