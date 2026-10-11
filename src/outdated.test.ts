import { describe, expect, it } from "vitest";

import { parseOutdated, readOutdated } from "./outdated";

const cwd = "/repo";

describe("parseOutdated", () => {
	it("reads the recursive format", () => {
		expect(
			parseOutdated(
				{
					"@orpc/client": {
						current: "1.15.4",
						latest: "1.15.5",
						wanted: "1.15.4",
						isDeprecated: false,
						dependencyType: "dependencies",
						dependentPackages: [
							{ name: "native", location: "/repo/apps/native" },
							{ name: "web", location: "/repo/apps/web" },
						],
					},
				},
				cwd,
			),
		).toEqual([
			{
				name: "@orpc/client",
				current: "1.15.4",
				latest: "1.15.5",
				locations: ["/repo/apps/native", "/repo/apps/web"],
			},
		]);
	});

	it("falls back to the working directory without dependents", () => {
		expect(
			parseOutdated({ ms: { current: "2.1.2", latest: "2.1.3" } }, cwd),
		).toEqual([
			{ name: "ms", current: "2.1.2", latest: "2.1.3", locations: [cwd] },
		]);
	});

	it("skips entries without two semver versions", () => {
		expect(
			parseOutdated(
				{
					missing: { latest: "1.0.0" },
					linked: { current: "link:../x", latest: "1.0.0" },
					git: { current: "1.0.0", latest: "github:o/r" },
					wanted: { current: "1.2.0", latest: "1.2.0", wanted: "1.3.0" },
					deprecated: { current: "2.0.0", latest: "1.9.0" },
					broken: "nope",
				},
				cwd,
			),
		).toEqual([]);
	});

	it.each([[null], ["text"], [42]])("is empty for %j", (value) => {
		expect(parseOutdated(value, cwd)).toEqual([]);
	});
});

describe("readOutdated", () => {
	it("parses what pnpm prints", async () => {
		const run = async () => '{"ms":{"current":"2.1.2","latest":"2.1.3"}}';
		expect(await readOutdated(cwd, run)).toEqual([
			{ name: "ms", current: "2.1.2", latest: "2.1.3", locations: [cwd] },
		]);
	});

	it("says to install when nothing is installed", async () => {
		const run = async () => '{"ms":{"latest":"2.1.3","wanted":"2.1.2"}}';
		await expect(readOutdated(cwd, run)).rejects.toThrow("Run pnpm install");
	});

	it("says so when the output is not JSON", async () => {
		const run = async () => "ERR_PNPM_NO_IMPORTER_MANIFEST_FOUND";
		await expect(readOutdated(cwd, run)).rejects.toThrow(
			"Could not read the output of pnpm outdated",
		);
	});
});
