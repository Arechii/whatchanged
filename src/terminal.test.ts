import { describe, expect, it } from "vitest";

import { statusOf, windowStart } from "./terminal";

describe("statusOf", () => {
	it("counts releases and names the other outcomes", () => {
		const release = { tag: "v1", body: "", url: "", version: "1.0.0" };
		expect(statusOf(undefined)).toBe("");
		expect(
			statusOf({ kind: "releases", releases: [release], truncated: false }),
		).toBe("1 release");
		expect(
			statusOf({
				kind: "releases",
				releases: [release, release],
				truncated: true,
			}),
		).toBe("2+ releases");
		expect(statusOf({ kind: "changelog", path: "", markdown: "" })).toBe(
			"changelog",
		);
		expect(statusOf({ kind: "missing" })).toBe("no notes");
		expect(statusOf({ kind: "failed", message: "", rateLimited: true })).toBe(
			"rate limited",
		);
	});
});

describe("windowStart", () => {
	it("keeps the cursor near the middle without running past either end", () => {
		expect(windowStart(0, 100, 10)).toBe(0);
		expect(windowStart(50, 100, 10)).toBe(45);
		expect(windowStart(99, 100, 10)).toBe(90);
		expect(windowStart(3, 5, 10)).toBe(0);
	});
});
