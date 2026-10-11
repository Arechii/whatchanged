/** A package's GitHub repository, and the folder in it the package lives in. */
export type GitHubRepo = {
	owner: string;
	name: string;
	directory: string;
};

/** The URL of a package.json `repository` field, in either of its shapes. */
export function repositoryUrl(repository: unknown): string | undefined {
	if (typeof repository === "string") return repository;
	if (
		typeof repository === "object" &&
		repository !== null &&
		"url" in repository &&
		typeof repository.url === "string"
	) {
		return repository.url;
	}
	return undefined;
}

const GITHUB_URL =
	/(?:^|[/@.])github\.com[/:]([\w.-]+)\/([\w.-]+?)(?:\.git)?(?=$|[/#?])(.*)$/;
// npm reads a bare `owner/repo` as GitHub.
const SHORTHAND = /^(?:github:)?([\w.-]+)\/([\w.-]+)$/;
const TREE_PATH = /^\/tree\/[^/]+\/([^#?]+)/;
const SAFE_PATH = /^[\w.@+/-]*$/;

function directoryOf(repository: unknown, rest: string): string {
	const declared =
		typeof repository === "object" &&
		repository !== null &&
		"directory" in repository &&
		typeof repository.directory === "string"
			? repository.directory
			: TREE_PATH.exec(rest)?.[1];
	const directory = (declared ?? "").replace(/^\.?\/+/, "").replace(/\/+$/, "");
	// It becomes part of a URL and is printed, and it comes from the package.
	const safe =
		SAFE_PATH.test(directory) && !directory.split("/").includes("..");
	return safe ? directory : "";
}

/** Reads a package.json `repository` field; null when it is not on GitHub. */
export function parseRepo(repository: unknown): GitHubRepo | null {
	const url = repositoryUrl(repository)?.trim();
	if (url === undefined) return null;
	const match = GITHUB_URL.exec(url) ?? SHORTHAND.exec(url);
	const owner = match?.[1];
	const name = match?.[2];
	if (owner === undefined || name === undefined) return null;
	return { owner, name, directory: directoryOf(repository, match?.[3] ?? "") };
}
