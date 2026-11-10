import { afterEach, expect, test } from "bun:test";
import { Window } from "happy-dom";
import { join } from "node:path";

const root = join(import.meta.dir, "..");
const markup = (await Bun.file(join(root, "public/index.html")).text()).replace(
  /<script[\s\S]*?<\/script>/g,
  "",
);
const bundle = await Bun.build({
  entrypoints: [join(root, "src/client.ts")],
  target: "browser",
});
const client = await bundle.outputs[0].text();
const windows: Window[] = [];
const base = {
  enabled: true,
  activeService: "Wi-Fi" as string | null,
  activeInterface: "en0" as string | null,
  configuredResolvers: ["127.0.0.1", "::1"],
  dnscryptRunning: true,
  lastAction: null as string | null,
  lastError: null as string | null,
};
type Status = typeof base;
const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

afterEach(async () => {
  await Promise.all(windows.splice(0).map((window) => window.happyDOM.close()));
});

async function setup(overrides: Partial<Status> = {}) {
  let status = { ...base, ...overrides };
  let fail = false;
  let unavailable = false;
  let delayed: (() => void) | undefined;
  let heldStatus: (() => void) | undefined;
  const mutations: { path: string; body?: { enabled: boolean } }[] = [];
  const window = new Window({
    url: "http://127.0.0.1:43173",
    settings: {
      enableJavaScriptEvaluation: true,
      suppressInsecureJavaScriptEnvironmentWarning: true,
    },
  });
  windows.push(window);
  let poll: (() => void) | undefined;
  // No network, timers, system commands, or real DNS changes are permitted.
  window.setInterval = ((callback: () => void) => {
    poll = callback;
    return 1;
  }) as typeof window.setInterval;
  window.fetch = (async (path: string, options?: RequestInit) => {
    if (unavailable) throw new Error("Fixture: local service unreachable");
    if (path === "/api/status") {
      const snapshot = JSON.stringify(status);
      if (heldStatus)
        await new Promise<void>((resolve) => {
          heldStatus = resolve;
        });
      return new Response(snapshot);
    }
    if (!["/api/toggle", "/api/stop-proxy"].includes(path))
      throw new Error("Unexpected test request");
    const body = options?.body ? JSON.parse(String(options.body)) : undefined;
    mutations.push({ path, body });
    if (delayed)
      await new Promise<void>((resolve) => {
        delayed = resolve;
      });
    if (fail) {
      status = { ...status, lastError: "Fixture: resolver checks failed." };
      return new Response(JSON.stringify(status), { status: 500 });
    }
    const enabled = path === "/api/toggle" ? body.enabled : false;
    status = {
      ...status,
      enabled,
      configuredResolvers: enabled ? ["127.0.0.1", "::1"] : [],
      dnscryptRunning: path !== "/api/stop-proxy",
      lastError: null,
    };
    return new Response(JSON.stringify(status));
  }) as typeof window.fetch;
  window.document.write(markup);
  window.eval(client);
  await settle();
  const element = (id: string) => window.document.getElementById(id)!;
  const button = (id: string) => element(id) as unknown as HTMLButtonElement;
  const dialog = (id: string) => element(id) as unknown as HTMLDialogElement;
  return {
    window,
    element,
    button,
    dialog,
    mutations,
    poll: async () => {
      poll?.();
      await settle();
    },
    fail: () => {
      fail = true;
    },
    unavailable: () => {
      unavailable = true;
    },
    delay: () => {
      delayed = () => {};
    },
    release: () => {
      delayed?.();
      delayed = undefined;
    },
    holdStatus: () => {
      heldStatus = () => {};
    },
    releaseStatus: () => {
      heldStatus?.();
      heldStatus = undefined;
    },
    setStatus: (next: Partial<Status>) => {
      status = { ...status, ...next };
    },
  };
}

test("shows the observed encrypted state and keeps a pending choice separate", async () => {
  const ui = await setup();
  expect(ui.window.document.body.dataset.state).toBe("encrypted");
  expect(ui.element("state-label").textContent).toBe("Ward active");
  expect(ui.button("apply-mode").disabled).toBe(true);
  ui.button("mode-automatic").click();
  expect(ui.button("mode-automatic").getAttribute("aria-pressed")).toBe("true");
  expect(ui.element("resolver-title").textContent).toBe("Encrypted\nDNS");
  expect(ui.mutations).toHaveLength(0);
  await ui.poll();
  expect(ui.button("mode-automatic").getAttribute("aria-pressed")).toBe("true");
});

test("requires confirmation, honors cancellation, then applies automatic DNS", async () => {
  const ui = await setup();
  ui.button("mode-automatic").click();
  ui.button("apply-mode").click();
  expect(ui.dialog("mode-dialog").open).toBe(true);
  ui.dialog("mode-dialog").close("cancel");
  expect(ui.mutations).toHaveLength(0);
  ui.button("apply-mode").click();
  ui.dialog("mode-dialog").close("confirm");
  await settle();
  expect(ui.mutations).toEqual([
    { path: "/api/toggle", body: { enabled: false } },
  ]);
  expect(ui.window.document.body.dataset.state).toBe("automatic");
  expect(ui.element("resolver-description").textContent).toBe(
    "Using network-provided DNS.",
  );
});

test("enables encrypted DNS from automatic mode", async () => {
  const ui = await setup({ enabled: false, configuredResolvers: [] });
  ui.button("mode-encrypted").click();
  ui.button("apply-mode").click();
  ui.dialog("mode-dialog").close("confirm");
  await settle();
  expect(ui.mutations[0].body).toEqual({ enabled: true });
  expect(ui.window.document.body.dataset.state).toBe("encrypted");
});

test("locks controls and suspends polling while a change is pending", async () => {
  const ui = await setup();
  ui.delay();
  ui.button("mode-automatic").click();
  ui.button("apply-mode").click();
  ui.dialog("mode-dialog").close("confirm");
  expect(ui.button("mode-encrypted").disabled).toBe(true);
  expect(ui.button("mode-automatic").disabled).toBe(true);
  expect(ui.button("stop-proxy").disabled).toBe(true);
  await ui.poll();
  expect(ui.window.document.body.dataset.busy).toBe("true");
  ui.release();
  await settle();
  expect(ui.window.document.body.dataset.busy).toBe("false");
});

test("a slow status request cannot overwrite a newly confirmed mode", async () => {
  const ui = await setup();
  ui.holdStatus();
  await ui.poll();
  ui.button("mode-automatic").click();
  ui.button("apply-mode").click();
  ui.dialog("mode-dialog").close("confirm");
  await settle();
  ui.releaseStatus();
  await settle();
  expect(ui.window.document.body.dataset.state).toBe("automatic");
  expect(ui.element("resolver-title").textContent).toBe("Automatic\nDNS");
});

test("failed changes retain the observed mode and show the error", async () => {
  const ui = await setup();
  ui.fail();
  ui.button("mode-automatic").click();
  ui.button("apply-mode").click();
  ui.dialog("mode-dialog").close("confirm");
  await settle();
  expect(ui.window.document.body.dataset.state).toBe("encrypted");
  expect(ui.element("message").textContent).toContain(
    "Could not change DNS settings.",
  );
  expect(ui.element("message").classList.contains("error")).toBe(true);
});

test("custom DNS is represented without claiming automatic mode", async () => {
  const ui = await setup({
    enabled: false,
    configuredResolvers: ["192.0.2.53"],
  });
  expect(ui.element("resolver-title").textContent).toBe("Custom\nDNS");
  expect(ui.button("mode-automatic").getAttribute("aria-pressed")).toBe(
    "false",
  );
  expect(ui.button("apply-mode").disabled).toBe(true);
  ui.button("mode-automatic").click();
  expect(ui.button("apply-mode").disabled).toBe(false);
});

test("a configured but stopped resolver is a warning with a restart action", async () => {
  const ui = await setup({ dnscryptRunning: false });
  expect(ui.window.document.body.dataset.state).toBe("warning");
  expect(ui.element("state-label").textContent).toBe("Resolver offline");
  expect(ui.button("apply-mode").disabled).toBe(false);
  expect(ui.button("apply-mode").textContent).toContain("Start resolver");
});

test("disables mode changes with no active network", async () => {
  const ui = await setup({ activeService: null, activeInterface: null });
  expect(ui.element("state-label").textContent).toBe("No network");
  expect(ui.button("mode-encrypted").disabled).toBe(true);
  expect(ui.button("apply-mode").disabled).toBe(true);
});

test("unavailable status never leaves stale facts or actionable mode controls", async () => {
  const ui = await setup();
  ui.unavailable();
  await ui.poll();
  expect(ui.window.document.body.dataset.state).toBe("unavailable");
  expect(ui.element("service").textContent).toBe("—");
  expect(ui.button("mode-automatic").disabled).toBe(true);
  expect(ui.button("stop-proxy").disabled).toBe(true);
});

test("stop requires confirmation and clears old dialog confirmation values", async () => {
  const ui = await setup();
  const dialog = ui.dialog("stop-dialog");
  dialog.returnValue = "confirm";
  ui.button("stop-proxy").click();
  expect(dialog.returnValue).toBe("");
  dialog.close();
  expect(ui.mutations).toHaveLength(0);
  ui.button("stop-proxy").click();
  dialog.close("confirm");
  await settle();
  expect(ui.mutations).toEqual([{ path: "/api/stop-proxy" }]);
  expect(ui.element("process").textContent).toBe("Stopped");
  expect(ui.button("stop-proxy").disabled).toBe(true);
});

test("renders diagnostic text as text rather than markup", async () => {
  const ui = await setup({ lastError: '<img src=x onerror="alert(1)">' });
  expect(ui.element("message").querySelector("img")).toBeNull();
  expect(ui.element("message").textContent).toContain("<img");
});
