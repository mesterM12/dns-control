import { existsSync } from "node:fs";

const port = 43173;
const statePath = `${import.meta.dir}/../state.json`;
const networksetup = "/usr/sbin/networksetup";
const pgrep = "/usr/bin/pgrep";
const route = "/sbin/route";
const sudo = "/usr/bin/sudo";
const helper = "/usr/local/libexec/dns-control-helper";

type Status = {
  enabled: boolean;
  activeService: string | null;
  activeInterface: string | null;
  configuredResolvers: string[];
  dnscryptRunning: boolean;
  lastAction: string | null;
  lastError: string | null;
};

let lastAction: string | null = null;
let lastError: string | null = null;

if (existsSync(statePath)) {
  try {
    ({ lastAction, lastError } = await Bun.file(statePath).json());
  } catch {
    // A status record is convenience only; a malformed one must not stop DNS control.
  }
}

function run(command: string[], timeout = 5_000) {
  return Bun.spawnSync(command, { stdout: "pipe", stderr: "pipe", timeout });
}

function output(command: string[]) {
  const result = run(command);
  return new TextDecoder().decode(result.stdout).trim();
}

function activeNetwork() {
  const defaultRoute = output([route, "-n", "get", "default"]);
  const device = defaultRoute.match(/^\s*interface:\s*(\S+)$/m)?.[1] ?? null;
  if (!device) return { service: null, device: null };

  const order = output([networksetup, "-listnetworkserviceorder"]);
  const entries = [...order.matchAll(/^\(\d+\)\s+(.+)\n\(Hardware Port: .+, Device: (\S+)\)$/gm)];
  const entry = entries.find((match) => match[2] === device);
  return { service: entry?.[1] ?? null, device };
}

function dnsServers(service: string | null) {
  if (!service) return [];
  const value = output([networksetup, "-getdnsservers", service]);
  if (!value || /There aren.t any DNS Servers set/i.test(value)) return [];
  return value.split("\n").map((line) => line.trim()).filter(Boolean);
}

function dnscryptRunning() {
  return run([pgrep, "-x", "dnscrypt-proxy"]).exitCode === 0;
}

function status(): Status {
  const network = activeNetwork();
  const resolvers = dnsServers(network.service);
  return {
    enabled: resolvers.includes("127.0.0.1") && resolvers.includes("::1"),
    activeService: network.service,
    activeInterface: network.device,
    configuredResolvers: resolvers,
    dnscryptRunning: dnscryptRunning(),
    lastAction,
    lastError,
  };
}

async function saveState() {
  await Bun.write(statePath, `${JSON.stringify({ lastAction, lastError }, null, 2)}\n`);
}

function runHelper(action: "enable" | "disable" | "stop") {
  const result = run([sudo, "-n", helper, action], 30_000);
  if (result.exitCode !== 0) {
    throw new Error(new TextDecoder().decode(result.stderr).trim() || "The DNS helper is not installed or is not authorized.");
  }
}

async function change(enabled: boolean) {
  runHelper(enabled ? "enable" : "disable");
  const network = activeNetwork();
  lastAction = `${enabled ? "Enabled DNS proxy" : "Restored DHCP DNS"}${network.service ? ` on ${network.service}` : ""}`;
  lastError = null;
  await saveState();
  return status();
}

async function stopProxy() {
  runHelper("stop");
  const network = activeNetwork();
  lastAction = `Stopped DNS proxy${network.service ? ` and restored DHCP DNS on ${network.service}` : " and restored DHCP DNS"}`;
  lastError = null;
  await saveState();
  return status();
}

function isLoopbackRequest(request: Request) {
  const host = request.headers.get("host")?.toLowerCase() ?? "";
  return host === "localhost" || host.startsWith("localhost:") || host === "127.0.0.1" || host.startsWith("127.0.0.1:") || host === "[::1]" || host.startsWith("[::1]:");
}

function isSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    return new URL(origin).host === request.headers.get("host");
  } catch {
    return false;
  }
}

const headers = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };
const app = async (request: Request) => {
  const url = new URL(request.url);
  if (!isLoopbackRequest(request)) return new Response("Not found", { status: 404 });

  if (url.pathname === "/api/status" && request.method === "GET") {
    return Response.json(status(), { headers });
  }
  if (url.pathname === "/api/toggle" && request.method === "POST") {
    if (!isSameOrigin(request)) return new Response("Forbidden", { status: 403, headers });
    const body = await request.json().catch(() => null) as { enabled?: unknown } | null;
    if (!body || typeof body.enabled !== "boolean") return new Response("Bad request", { status: 400, headers });
    try {
      return Response.json(await change(body.enabled), { headers });
    } catch (error) {
      lastError = error instanceof Error ? error.message : "The DNS change failed.";
      await saveState();
      return Response.json(status(), { status: 500, headers });
    }
  }
  if (url.pathname === "/api/stop-proxy" && request.method === "POST") {
    if (!isSameOrigin(request)) return new Response("Forbidden", { status: 403, headers });
    try {
      return Response.json(await stopProxy(), { headers });
    } catch (error) {
      lastError = error instanceof Error ? error.message : "The DNS proxy could not be stopped.";
      await saveState();
      return Response.json(status(), { status: 500, headers });
    }
  }
  if (url.pathname === "/" && request.method === "GET") {
    return new Response(Bun.file(`${import.meta.dir}/../public/index.html`), { headers: { ...headers, "Content-Type": "text/html; charset=utf-8" } });
  }
  if (url.pathname === "/app.css" && request.method === "GET") {
    return new Response(Bun.file(`${import.meta.dir}/../public/app.css`), { headers: { ...headers, "Content-Type": "text/css; charset=utf-8" } });
  }
  if (url.pathname === "/app.js" && request.method === "GET") {
    return new Response(Bun.file(`${import.meta.dir}/../public/app.js`), { headers: { ...headers, "Content-Type": "text/javascript; charset=utf-8" } });
  }
  return new Response("Not found", { status: 404, headers });
};

Bun.serve({ hostname: "127.0.0.1", port, fetch: app });
Bun.serve({ hostname: "::1", port, fetch: app });
console.log(`DNS Control listening at http://127.0.0.1:${port}`);
