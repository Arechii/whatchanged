#!/usr/bin/env node
import { resolve } from "node:path";
import { parseArgs } from "node:util";

import manifest from "../package.json" with { type: "json" };
import { createGitHub, findToken } from "./github";
import { findGroups, findNotes } from "./notes";
import { readOutdated } from "./outdated";
import { renderPlain } from "./plain";

const HELP = `Usage: whatchanged [options] [package...]

Shows the release notes between the installed and the latest version of
every outdated dependency in a pnpm workspace. Name packages to see only those.

Options:
  --cwd <dir>      Workspace to read (default: the current directory)
  -v, --version    Print the version
  -h, --help       Print this help

Environment:
  GITHUB_TOKEN     Raises GitHub's limit from 60 to 5,000 requests an hour.
                   Without it, the token of a signed-in GitHub CLI is used.
`;

async function main(): Promise<void> {
	const { values, positionals } = parseArgs({
		allowPositionals: true,
		options: {
			cwd: { type: "string" },
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

	const cwd = resolve(values.cwd ?? process.cwd());
	const outdated = (await readOutdated(cwd)).filter(
		(dependency) =>
			positionals.length === 0 || positionals.includes(dependency.name),
	);
	for (const name of positionals) {
		if (!outdated.some((dependency) => dependency.name === name)) {
			process.stderr.write(`${name} is not outdated, or not a dependency.\n`);
		}
	}
	if (outdated.length === 0) {
		process.stderr.write("Nothing to show: every dependency is up to date.\n");
		return;
	}

	const token = await findToken();
	if (token === undefined) {
		process.stderr.write(
			"No GitHub token, so GitHub allows 60 requests an hour. Set GITHUB_TOKEN or run `gh auth login`.\n",
		);
	}
	const github = createGitHub({ fetch, token });
	const groups = await findGroups(outdated, { fetch });
	const notes = await Promise.all(
		groups.map((group) => findNotes(group, github)),
	);
	process.stdout.write(renderPlain(groups, notes));
}

main().catch((error: unknown) => {
	process.stderr.write(
		`whatchanged: ${error instanceof Error ? error.message : String(error)}\n`,
	);
	process.exitCode = 1;
});
