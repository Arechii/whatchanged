import { spawn } from "node:child_process";

/**
 * The program and arguments that open `url` in the default browser, or null
 * for anything but an http(s) URL, since the URL comes from package metadata.
 */
export function browserCommand(
	url: string,
	platform: NodeJS.Platform = process.platform,
): [string, string[]] | null {
	if (!/^https?:\/\//.test(url)) return null;
	if (platform === "darwin") return ["open", [url]];
	// explorer.exe takes the URL as one argument; `start` would need a shell.
	if (platform === "win32") return ["explorer.exe", [url]];
	return ["xdg-open", [url]];
}

/** Opens `url` in the default browser without waiting for it. */
export function openUrl(url: string): void {
	const command = browserCommand(url);
	if (!command) return;
	const [program, args] = command;
	const child = spawn(program, args, { detached: true, stdio: "ignore" });
	// A machine without a browser opener just doesn't open one.
	child.on("error", function ignoreMissingOpener() {
		return undefined;
	});
	child.unref();
}
