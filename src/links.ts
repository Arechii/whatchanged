import type { Group, Notes } from "./notes";

const SHORTHAND_HOSTS: Record<string, string> = {
	gitlab: "gitlab.com",
	bitbucket: "bitbucket.org",
	gist: "gist.github.com",
};

/** A browsable https URL for a non-GitHub `repository` field, if it has one. */
export function browsableUrl(url: string | undefined): string | undefined {
	if (url === undefined) return undefined;
	const shorthand = /^(gitlab|bitbucket|gist):(.+)$/.exec(url);
	if (shorthand?.[1] !== undefined && shorthand[2] !== undefined) {
		return `https://${SHORTHAND_HOSTS[shorthand[1]]}/${shorthand[2]}`;
	}
	const https = url
		.replace(/^git\+/, "")
		.replace(/^git:\/\//, "https://")
		.replace(/^ssh:\/\/git@/, "https://")
		.replace(/^git@([^:]+):/, "https://$1/")
		.replace(/\.git$/, "");
	if (!URL.canParse(https)) return undefined;
	// Parsing percent-encodes the control characters a package could plant.
	const parsed = new URL(https);
	return parsed.protocol === "https:" || parsed.protocol === "http:"
		? parsed.href
		: undefined;
}

/** The page that shows the most about a group's changes. */
export function linkFor(group: Group, notes: Notes): string {
	const npm = `https://www.npmjs.com/package/${group.names[0] ?? ""}`;
	if (!group.repo) return browsableUrl(group.repositoryUrl) ?? npm;
	const base = `https://github.com/${group.repo.owner}/${group.repo.name}`;
	switch (notes.kind) {
		case "releases": {
			const newest = notes.releases[0];
			if (newest?.tag.includes(newest.version)) {
				const from = newest.tag.replace(newest.version, group.current);
				return `${base}/compare/${from}...${newest.tag}`;
			}
			return `${base}/releases`;
		}
		case "changelog":
			return `${base}/blob/HEAD/${notes.path}`;
		case "typings":
			return `${base}/commits/HEAD/${group.repo.directory}`;
		case "missing":
		case "failed":
			return `${base}/releases`;
		case "elsewhere":
			return browsableUrl(group.repositoryUrl) ?? npm;
	}
}
