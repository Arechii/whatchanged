import { defineConfig } from "tsdown";

export default defineConfig({
	entry: ["src/cli.ts"],
	platform: "node",
	target: "node22",
	format: "esm",
	// Every runtime package is compiled in, so the published package has no
	// dependencies for npx to install.
	deps: { alwaysBundle: [/./], onlyBundle: false },
	dts: false,
	minify: true,
});
