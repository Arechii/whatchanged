import { describe, expect, it } from "vitest";

import { fenceReader } from "./fences";

const positions = (...lines: string[]) => lines.map(fenceReader());

describe("fenceReader", () => {
	it("marks fences and the code between them", () => {
		expect(positions("a", "```sh", "# comment", "```", "b")).toEqual([
			"outside",
			"marker",
			"inside",
			"marker",
			"outside",
		]);
	});

	it("closes only on the same character, at least as long", () => {
		expect(positions("~~~~", "```", "~~~", "~~~~", "after")).toEqual([
			"marker",
			"inside",
			"inside",
			"marker",
			"outside",
		]);
	});

	it("ignores fences indented as code", () => {
		expect(positions("    ```", "text")).toEqual(["outside", "outside"]);
	});
});
