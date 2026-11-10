import { describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { helperInstallCommands, printLine, shellQuote, sudoersRule } from "./privileged-install";

describe("privileged installer command generation", () => {
  test("writes exactly the three permitted actions followed by a real newline", async () => {
    const directory = await mkdtemp(join(tmpdir(), "dns-control-rule-test-"));
    try {
      const destination = join(directory, "rule with an apostrophe's name");
      const command = helperInstallCommands("/unused/helper", "test_user")
        .find((line) => line.startsWith("/usr/bin/printf"));
      expect(command).toBeDefined();
      const result = Bun.spawnSync(["/bin/sh", "-c", command!], {
        env: { ...process.env, rule_tmp: destination },
        stdout: "pipe",
        stderr: "pipe",
      });
      expect(result.exitCode).toBe(0);
      const contents = await readFile(destination, "utf8");
      expect(contents).toBe("test_user ALL=(root) NOPASSWD: /usr/local/libexec/dns-control-helper enable, /usr/local/libexec/dns-control-helper disable, /usr/local/libexec/dns-control-helper stop\n");
      expect(contents.endsWith("stop\\n")).toBe(false);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  test("preserves apostrophes and shell syntax as literal text", () => {
    const value = "/tmp/reviewer's $(printf injected) `printf injected` $HOME";
    const result = Bun.spawnSync(["/bin/sh", "-c", printLine(value)], {
      stdout: "pipe",
      stderr: "pipe",
    });
    expect(result.exitCode).toBe(0);
    expect(new TextDecoder().decode(result.stdout)).toBe(`${value}\n`);
    expect(helperInstallCommands(value, "test_user")[2]).toContain(shellQuote(value));
  });

  test("rejects usernames that could change the sudoers rule", () => {
    for (const username of ["", "test ALL=(ALL) ALL", "test\nroot", "test,root"]) {
      expect(() => sudoersRule(username)).toThrow("safe macOS username");
    }
  });

  test.skipIf(process.platform !== "darwin")("preserves the newline through AppleScript without administrator access", async () => {
    const directory = await mkdtemp(join(tmpdir(), "dns-control-applescript-test-"));
    try {
      // Only printf runs here; no installer, helper, or administrator prompt is invoked.
      const destination = join(directory, "sudoers");
      const command = `${printLine(sudoersRule("test_user"))} > ${shellQuote(destination)}`;
      const script = `do shell script ${JSON.stringify(command)}`;
      const result = Bun.spawnSync(["/usr/bin/osascript", "-e", script], {
        stdout: "pipe",
        stderr: "pipe",
      });
      expect(result.exitCode).toBe(0);
      expect(await readFile(destination, "utf8")).toBe(`${sudoersRule("test_user")}\n`);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
