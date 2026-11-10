import { expect, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Exercise the real CLI, but deny all actual installer subprocesses.
async function runInstaller(configuration: string) {
  const directory = await mkdtemp(join(tmpdir(), "dns-control-installer-test-"));
  try {
    const config = join(directory, "reviewed.toml");
    const capture = join(directory, "commands.json");
    const preload = join(directory, "guard.ts");
    await writeFile(config, configuration);
    await writeFile(preload, `
const commands = [];
Bun.spawnSync = (command) => {
  if (command[0] !== "/usr/bin/true" && command[0] !== "osascript") {
    throw new Error("Unexpected installer subprocess");
  }
  commands.push(command);
  require("node:fs").writeFileSync(${JSON.stringify(capture)}, JSON.stringify(commands));
  return { exitCode: 0, stdout: new Uint8Array(), stderr: new Uint8Array() };
};
`);
    const result = Bun.spawnSync([
      process.execPath, "--preload", preload,
      join(import.meta.dir, "install-resolver.ts"),
      "--binary", "/usr/bin/true", "--config", config,
    ], { stdout: "pipe", stderr: "pipe" });
    const commands: string[][] = await readFile(capture, "utf8").then(JSON.parse).catch(() => []);
    return {
      exitCode: result.exitCode,
      output: new TextDecoder().decode(result.stdout) + new TextDecoder().decode(result.stderr),
      commands,
    };
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

test("rejects relative configuration dependencies before requesting installation", async () => {
  const result = await runInstaller(`
listen_addresses = ['127.0.0.1:53', '[::1]:53']
[blocked_names]
blocked_names_file = 'fixture-private-path/blocked-names.txt'
`);
  expect(result.exitCode).not.toBe(0);
  expect(result.commands.some(([command]) => command === "osascript")).toBe(false);
  expect(result.output).not.toContain("fixture-private-path");
});

test("does not expose malformed configuration contents", async () => {
  const result = await runInstaller(`server_names = ["fixture-private-provider"`);
  expect(result.exitCode).not.toBe(0);
  expect(result.commands.some(([command]) => command === "osascript")).toBe(false);
  expect(result.output).not.toContain("fixture-private-provider");
});

test("validates a self-contained configuration before preparing installation", async () => {
  const result = await runInstaller(`listen_addresses = ['127.0.0.1:53', '[::1]:53']\n`);
  expect(result.exitCode).toBe(0);
  expect(result.commands.map(([command]) => command)).toEqual(["/usr/bin/true", "osascript"]);
  const appleScript = result.commands[1][2];
  const shell = JSON.parse(appleScript.slice("do shell script ".length, -" with administrator privileges".length));
  const syntax = Bun.spawnSync(["/bin/sh", "-n", "-c", shell], { stdout: "pipe", stderr: "pipe" });
  expect(syntax.exitCode).toBe(0);
  expect(shell).toContain("/bin/launchctl disable system/com.local.dnscrypt-proxy");
});
