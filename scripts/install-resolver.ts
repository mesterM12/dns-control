import { join, resolve } from "node:path";
import { mkdtemp, chmod, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { validateResolverConfigPaths } from "./resolver-config";
import { helperInstallCommands, printLine, shellQuote as q } from "./privileged-install";

// Snapshot a mise-managed executable and reviewed configuration into root-owned
// paths. launchd must not run a user-writable mise binary/configuration as root.
const args = process.argv.slice(2);
const option = (name: string) => {
  const index = args.indexOf(name);
  return index < 0 ? undefined : args[index + 1];
};
if (args.some((arg, i) => i % 2 === 0 && !["--binary", "--config"].includes(arg)) || args.length % 2) {
  throw new Error("Usage: bun run install:resolver --binary PATH --config PATH");
}
const suppliedBinary = option("--binary") ?? Bun.which("dnscrypt-proxy");
const suppliedConfig = option("--config");
if (!suppliedBinary || !suppliedConfig) throw new Error("Supply a dnscrypt-proxy binary and a reviewed --config file.");
const binary = resolve(suppliedBinary);
const config = resolve(suppliedConfig);
if (!(await stat(binary)).isFile() || !(await stat(config)).isFile()) {
  throw new Error("The binary and configuration must be regular files.");
}
validateResolverConfigPaths(await Bun.file(config).text());
const check = Bun.spawnSync([binary, "-config", config, "-check"], { stdout: "pipe", stderr: "pipe" });
if (check.exitCode !== 0) throw new Error("Resolver configuration validation failed. No privileged files were changed.");

const root = "/Library/Application Support/DNS Control";
const label = "com.local.dnscrypt-proxy";
const destinationConfig = `${root}/dnscrypt-proxy.toml`;
const plist = `/Library/LaunchDaemons/${label}.plist`;
const helper = resolve(import.meta.dir, "..", "privileged", "dns-control-helper");
const user = process.env.USER;
if (!user || !/^[a-z_][a-z0-9_-]*$/i.test(user)) throw new Error("Unable to determine a safe macOS username.");
const work = await mkdtemp(join(tmpdir(), "dns-control-resolver-"));
await chmod(work, 0o700);
try {
  const sourcePlist = join(work, `${label}.plist`);
  await Bun.write(sourcePlist, `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>${label}</string>
  <key>ProgramArguments</key><array><string>${root}/dnscrypt-proxy</string><string>-config</string><string>${destinationConfig}</string></array>
  <key>WorkingDirectory</key><string>${root}</string>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>/var/log/dns-control-resolver.log</string>
  <key>StandardErrorPath</key><string>/var/log/dns-control-resolver.error.log</string>
</dict></plist>
`);
  const command = [
    "set -eu",
    `/bin/test ! -L ${q(root)} && /bin/test ! -L ${q(`${root}/dnscrypt-proxy`)} && /bin/test ! -L ${q(plist)}`,
    `/bin/test ! -e ${q(destinationConfig)} && /bin/test ! -L ${q(destinationConfig)} || { ${printLine("A resolver configuration already exists; review it before replacing it.")} >&2; exit 1; }`,
    `/usr/bin/install -d -o root -g wheel -m 0755 ${q(root)}`,
    `/usr/bin/install -o root -g wheel -m 0755 ${q(binary)} ${q(`${root}/dnscrypt-proxy`)}`,
    `/usr/bin/install -o root -g wheel -m 0600 ${q(config)} ${q(destinationConfig)}`,
    `/usr/bin/install -o root -g wheel -m 0644 ${q(sourcePlist)} ${q(plist)}`,
    `/usr/bin/plutil -lint ${q(plist)}`,
    ...helperInstallCommands(helper, user),
    // The helper enables/bootstrap this service only on an explicit DNS action.
    `/bin/launchctl disable system/${label}`,
  ].join("\n");
  const result = Bun.spawnSync(["osascript", "-e", `do shell script ${JSON.stringify(command)} with administrator privileges`], { stdout: "pipe", stderr: "pipe" });
  if (result.exitCode !== 0) throw new Error("Resolver service installation failed or was cancelled. Check the local macOS installer output.");
  console.log("Installed the root-owned resolver and narrow helper; service remains disabled and system DNS is unchanged.");
} finally {
  await rm(work, { recursive: true, force: true });
}
