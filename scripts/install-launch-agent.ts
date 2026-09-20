import { mkdir } from "node:fs/promises";
import { join } from "node:path";

const home = process.env.HOME;
const uid = process.getuid?.();

if (!home || uid === undefined) throw new Error("macOS user environment is required.");

const root = join(import.meta.dir, "..");
const label = "com.local.dns-control";
const launchAgents = join(home, "Library", "LaunchAgents");
const plistPath = join(launchAgents, `${label}.plist`);
const logs = join(root, "logs");
const xml = (value: string) => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

await mkdir(launchAgents, { recursive: true });
await mkdir(logs, { recursive: true });

await Bun.write(plistPath, `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>${label}</string>
  <key>ProgramArguments</key><array><string>${xml(process.execPath)}</string><string>${xml(join(root, "src", "server.ts"))}</string></array>
  <key>WorkingDirectory</key><string>${xml(root)}</string>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ProcessType</key><string>Background</string>
  <key>StandardOutPath</key><string>${xml(join(logs, "launchd.out.log"))}</string>
  <key>StandardErrorPath</key><string>${xml(join(logs, "launchd.err.log"))}</string>
</dict></plist>
`);

Bun.spawnSync(["launchctl", "bootout", `gui/${uid}/${label}`]);
const result = Bun.spawnSync(["launchctl", "bootstrap", `gui/${uid}`, plistPath]);
if (result.exitCode !== 0) throw new Error(new TextDecoder().decode(result.stderr).trim());

console.log(`Installed ${label}.`);
