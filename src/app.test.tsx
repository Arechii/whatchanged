import { render } from "ink-testing-library";
import { describe, expect, it, vi } from "vitest";

import { App } from "./app";
import type { Bump, Group, Notes } from "./notes";

const group = (
	name: string,
	bump: Bump,
	current = "1.0.0",
	latest = "2.0.0",
): Group => ({
	key: name,
	names: [name],
	current,
	latest,
	bump,
	repo: { owner: "o", name, directory: "" },
	directories: [""],
	repositoryUrl: `https://github.com/o/${name}`,
});

const groups = [
	group("alpha", "major"),
	group("beta", "patch", "1.0.0", "1.0.1"),
];

const notesFor = async (found: Group): Promise<Notes> =>
	found.key === "alpha"
		? {
				kind: "releases",
				releases: [
					{
						tag: "v2.0.0",
						body: "## Breaking\n- **core**: dropped [#7](https://x)",
						url: "",
						version: "2.0.0",
					},
				],
				truncated: false,
			}
		: { kind: "missing" };

const noop = () => undefined;
const ENTER = "\r";
const ESCAPE = "\u001B";

describe("App", () => {
	it("lists the groups and fills in their notes as they arrive", async () => {
		const { lastFrame } = render(
			<App groups={groups} notesFor={notesFor} openUrl={noop} />,
		);
		expect(lastFrame()).toContain("2 outdated, 1 major");
		expect(lastFrame()).toContain("1.0.0 → 2.0.0");
		await vi.waitFor(() => {
			expect(lastFrame()).toContain("1 release");
			expect(lastFrame()).toContain("no notes");
		});
		expect(lastFrame()).not.toContain("reading notes");
	});

	it("moves the cursor with j and k", async () => {
		const { lastFrame, stdin } = render(
			<App groups={groups} notesFor={notesFor} openUrl={noop} />,
		);
		expect(lastFrame()).toMatch(/› major\s+alpha/);
		stdin.write("j");
		await vi.waitFor(() => {
			expect(lastFrame()).toMatch(/› patch\s+beta/);
		});
		stdin.write("k");
		await vi.waitFor(() => {
			expect(lastFrame()).toMatch(/› major\s+alpha/);
		});
	});

	it("shows a failed lookup instead of spinning forever", async () => {
		const { lastFrame } = render(
			<App
				groups={[group("alpha", "major")]}
				notesFor={() => Promise.reject(new Error("offline"))}
				openUrl={noop}
			/>,
		);
		await vi.waitFor(() => {
			expect(lastFrame()).toContain("failed");
		});
	});

	it("reads a group's notes and moves between groups", async () => {
		const { lastFrame, stdin } = render(
			<App groups={groups} notesFor={notesFor} openUrl={noop} />,
		);
		await vi.waitFor(() => {
			expect(lastFrame()).toContain("1 release");
		});
		stdin.write(ENTER);
		await vi.waitFor(() => {
			expect(lastFrame()).toContain("alpha 1.0.0 → 2.0.0");
		});
		expect(lastFrame()).toContain("v2.0.0");
		expect(lastFrame()).toContain("- core: dropped #7");
		expect(lastFrame()).toContain(
			"https://github.com/o/alpha/compare/v1.0.0...v2.0.0",
		);
		stdin.write("n");
		await vi.waitFor(() => {
			expect(lastFrame()).toContain("No release notes found.");
		});
		stdin.write(ESCAPE);
		await vi.waitFor(() => {
			expect(lastFrame()).toMatch(/› patch\s+beta/);
		});
	});

	it("opens the group's page in the browser with o", async () => {
		const openUrl = vi.fn<(url: string) => void>();
		const { lastFrame, stdin } = render(
			<App groups={groups} notesFor={notesFor} openUrl={openUrl} />,
		);
		await vi.waitFor(() => {
			expect(lastFrame()).toContain("1 release");
		});
		stdin.write("o");
		const url = "https://github.com/o/alpha/compare/v1.0.0...v2.0.0";
		await vi.waitFor(() => {
			expect(lastFrame()).toContain(`Opening ${url}`);
		});
		expect(openUrl).toHaveBeenCalledWith(url);
	});

	it("shows the warning it is given", () => {
		const { lastFrame } = render(
			<App
				groups={groups}
				notesFor={notesFor}
				openUrl={noop}
				warning="No GitHub token"
			/>,
		);
		expect(lastFrame()).toContain("No GitHub token");
	});
});
