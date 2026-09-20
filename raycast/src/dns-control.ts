import { existsSync } from "node:fs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

export const controlPageUrl = "http://127.0.0.1:43173";
const statusUrl = `${controlPageUrl}/api/status`;
const helperPath = "/usr/local/libexec/dns-control-helper";
const sudoPath = "/usr/bin/sudo";
const execFileAsync = promisify(execFile);

export type DnsStatus = {
  enabled: boolean;
  activeService: string | null;
  activeInterface: string | null;
  configuredResolvers: string[];
  dnscryptRunning: boolean;
  lastAction: string | null;
  lastError: string | null;
};

export async function getStatus(): Promise<DnsStatus> {
  const response = await fetch(statusUrl);
  if (!response.ok) throw new Error(`DNS Control returned ${response.status}.`);
  return (await response.json()) as DnsStatus;
}

export async function setEnabled(enabled: boolean): Promise<void> {
  if (!existsSync(helperPath)) {
    throw new Error(`DNS Control helper is not installed at ${helperPath}.`);
  }

  await execFileAsync(sudoPath, [
    "-n",
    helperPath,
    enabled ? "enable" : "disable",
  ]);
}
