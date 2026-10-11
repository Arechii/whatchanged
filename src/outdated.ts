import { execFile } from "node:child_process";

import semver from "semver";

/** One outdated dependency, and the workspace packages that depend on it. */
export type Outdated = {
	name: string;
	current: string;
	latest: string;
	locations: string[];
};

function locationsOf(info: Record<string, unknown>): string[] {
	const { dependentPackages } = info;
	if (!Array.isArray(dependentPackages)) return [];
	return dependentPackages.flatMap((dependent: unknown) =>
		typeof dependent === "object" &&
		dependent !== null &&
		"location" in dependent &&
		typeof dependent.location === "string"
			? [dependent.location]
			: [],
	);
}

/**
 * Reads `pnpm -r outdated --format json`, leaving out anything without an
 * installed and a newer latest semver version (links, git and file
 * dependencies, or no upgrade at all).
 */
export function parseOutdated(json: unknown, cwd: string): Outdated[] {
	if (typeof json !== "object" || json === null) return [];
	return Object.entries(json as Record<string, unknown>).flatMap(
		([name, value]) => {
			if (typeof value !== "object" || value === null) return [];
			const info = value as Record<string, unknown>;
			const current =
				typeof info.current === "string" ? semver.valid(info.current) : null;
			const latest =
				typeof info.latest === "string" ? semver.valid(info.latest) : null;
			// pnpm also lists a package whose installed version is not the
			// wanted one, or whose latest is deprecated; neither is an upgrade.
			if (current === null || latest === null) return [];
			if (!semver.gt(latest, current)) return [];
			const locations = locationsOf(info);
			return [
				{
					name,
					current,
					latest,
					locations: locations.length > 0 ? locations : [cwd],
				},
			];
		},
	);
}

// ponytail: pnpm keys its JSON by name alone, so when two workspace packages
// pin different versions only one survives. Upgrade by running per package.
function pnpmOutdated(cwd: string): Promise<string> {
	return new Promise((resolve, reject) => {
		// pnpm is a .cmd shim on Windows, which only a shell can start, and a
		// shell takes the command as one string rather than as arguments.
		const windows = process.platform === "win32";
		execFile(
			windows ? "pnpm -r outdated --format json" : "pnpm",
			windows ? [] : ["-r", "outdated", "--format", "json"],
			{ cwd, maxBuffer: 64 * 1024 * 1024, shell: windows },
			(error, stdout, stderr) => {
				// pnpm exits 1 whenever something is outdated, so the output decides.
				if (stdout.trim() !== "") resolve(stdout);
				else {
					reject(
						new Error(
							stderr.trim() ||
								error?.message ||
								"pnpm outdated printed nothing",
						),
					);
				}
			},
		);
	});
}

/** The workspace's outdated dependencies, as pnpm reports them. */
export async function readOutdated(
	cwd: string,
	run: (cwd: string) => Promise<string> = pnpmOutdated,
): Promise<Outdated[]> {
	const output = await run(cwd);
	let json: unknown;
	try {
		json = JSON.parse(output);
	} catch {
		throw new Error(`Could not read the output of pnpm outdated:\n${output}`);
	}
	const outdated = parseOutdated(json, cwd);
	if (outdated.length === 0 && listsUninstalled(json)) {
		throw new Error(
			"pnpm lists dependencies that are not installed. Run pnpm install, then try again.",
		);
	}
	return outdated;
}

// Without node_modules, pnpm reports a latest version but no current one.
function listsUninstalled(json: unknown): boolean {
	if (typeof json !== "object" || json === null) return false;
	return Object.values(json).some(
		(info: unknown) =>
			typeof info === "object" &&
			info !== null &&
			!("current" in info) &&
			"latest" in info,
	);
}
