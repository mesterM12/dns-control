import { join } from "node:path";
import { helperInstallCommands } from "./privileged-install";

const user = process.env.USER;
if (!user || !/^[a-z_][a-z0-9_-]*$/i.test(user)) throw new Error("Unable to determine a safe macOS username.");

const helper = join(import.meta.dir, "..", "privileged", "dns-control-helper");
const command = ["set -eu", ...helperInstallCommands(helper, user)].join("\n");
const appleScript = `do shell script ${JSON.stringify(command)} with administrator privileges`;
const result = Bun.spawnSync(["osascript", "-e", appleScript], { stdout: "pipe", stderr: "pipe" });

if (result.exitCode !== 0) throw new Error(new TextDecoder().decode(result.stderr).trim() || "Helper installation was cancelled.");
console.log("Installed the DNS Control privileged helper.");
