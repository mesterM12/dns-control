import { join } from "node:path";

const user = process.env.USER;
if (!user || !/^[a-z_][a-z0-9_-]*$/i.test(user)) throw new Error("Unable to determine a safe macOS username.");

const helper = join(import.meta.dir, "..", "privileged", "dns-control-helper");
const sudoers = `${user} ALL=(root) NOPASSWD: /usr/local/libexec/dns-control-helper enable, /usr/local/libexec/dns-control-helper disable, /usr/local/libexec/dns-control-helper stop`;
const command = `/usr/bin/install -d -o root -g wheel -m 0755 /usr/local/libexec /etc/sudoers.d && /usr/bin/install -o root -g wheel -m 0755 ${shellQuote(helper)} /usr/local/libexec/dns-control-helper && /usr/bin/printf '%s\\n' ${shellQuote(sudoers)} > /etc/sudoers.d/dns-control.tmp && /usr/sbin/visudo -cf /etc/sudoers.d/dns-control.tmp && /usr/bin/install -o root -g wheel -m 0440 /etc/sudoers.d/dns-control.tmp /etc/sudoers.d/dns-control && /bin/rm -f /etc/sudoers.d/dns-control.tmp`;
const appleScript = `do shell script ${JSON.stringify(command)} with administrator privileges`;
const result = Bun.spawnSync(["osascript", "-e", appleScript], { stdout: "pipe", stderr: "pipe" });

if (result.exitCode !== 0) throw new Error(new TextDecoder().decode(result.stderr).trim() || "Helper installation was cancelled.");
console.log("Installed the DNS Control privileged helper.");

function shellQuote(value: string) {
  return `'${value.replaceAll("'", "'\\\"'\\\"'")}'`;
}
