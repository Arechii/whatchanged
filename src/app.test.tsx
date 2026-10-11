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
				releases: [{ tag: "v2.0.0", body: "", url: "", version: "2.0.0" }],
				truncated: false,
			}
		: { kind: "missing" };

describe("App", () => {
	it("lists the groups and fills in their notes as they arrive", async () => {
		const { lastFrame } = render(<App groups={groups} notesFor={notesFor} />);
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
			<App groups={groups} notesFor={notesFor} />,
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
			/>,
		);
		await vi.waitFor(() => {
			expect(lastFrame()).toContain("failed");
		});
	});

	it("shows the warning it is given", () => {
		const { lastFrame } = render(
			<App groups={groups} notesFor={notesFor} warning="No GitHub token" />,
		);
		expect(lastFrame()).toContain("No GitHub token");
	});
});
