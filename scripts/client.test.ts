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

test("the large logo is an accessible toggle showing the observed state", async () => {
  const ui = await setup();
  const toggle = ui.button("toggle");
  expect(toggle.tagName).toBe("BUTTON");
  expect(toggle.querySelector("use")?.getAttribute("href")).toBe("#ward-sigil");
  expect(toggle.getAttribute("aria-pressed")).toBe("true");
  expect(toggle.getAttribute("aria-label")).toBe("Turn off encrypted DNS");
  expect(toggle.disabled).toBe(false);
  expect(ui.mutations).toHaveLength(0);
  expect(ui.element("mode-dialog")).toBeNull();
});

test("one press turns encrypted DNS off without an Apply step", async () => {
  const ui = await setup();
  ui.button("toggle").click();
  await settle();
  expect(ui.mutations).toEqual([
    { path: "/api/toggle", body: { enabled: false } },
  ]);
  expect(ui.window.document.body.dataset.state).toBe("automatic");
  expect(ui.button("toggle").getAttribute("aria-pressed")).toBe("false");
  expect(ui.element("resolver-description").textContent).toBe(
    "Using network-provided DNS.",
  );
});

test("one press turns encrypted DNS on from automatic mode", async () => {
  const ui = await setup({ enabled: false, configuredResolvers: [] });
  expect(ui.button("toggle").getAttribute("aria-label")).toBe(
    "Turn on encrypted DNS",
  );
  ui.button("toggle").click();
  await settle();
  expect(ui.mutations[0].body).toEqual({ enabled: true });
  expect(ui.window.document.body.dataset.state).toBe("encrypted");
  expect(ui.button("toggle").getAttribute("aria-pressed")).toBe("true");
});

test("locks the logo during a change and prevents duplicate requests", async () => {
  const ui = await setup();
  ui.delay();
  ui.button("toggle").click();
  expect(ui.button("toggle").disabled).toBe(true);
  expect(ui.button("toggle").getAttribute("aria-busy")).toBe("true");
  expect(ui.button("toggle").getAttribute("aria-pressed")).toBe("true");
  expect(ui.button("stop-proxy").disabled).toBe(true);
  ui.button("toggle").click();
  await ui.poll();
  expect(ui.mutations).toHaveLength(1);
  expect(ui.window.document.body.dataset.busy).toBe("true");
  ui.release();
  await settle();
  expect(ui.window.document.body.dataset.busy).toBe("false");
  expect(ui.button("toggle").getAttribute("aria-busy")).toBe("false");
});

test("a slow status request cannot overwrite the new toggle state", async () => {
  const ui = await setup();
  ui.holdStatus();
  await ui.poll();
  ui.button("toggle").click();
  await settle();
  ui.releaseStatus();
  await settle();
  expect(ui.window.document.body.dataset.state).toBe("automatic");
  expect(ui.element("resolver-title").textContent).toBe("Automatic DNS");
  expect(ui.button("toggle").getAttribute("aria-pressed")).toBe("false");
});

test("failed changes retain the observed state and show the error", async () => {
  const ui = await setup();
  ui.fail();
  ui.button("toggle").click();
  await settle();
  expect(ui.window.document.body.dataset.state).toBe("encrypted");
  expect(ui.button("toggle").getAttribute("aria-pressed")).toBe("true");
  expect(ui.button("toggle").disabled).toBe(false);
  expect(ui.element("message").textContent).toContain(
    "Could not change DNS settings.",
  );
  expect(ui.element("message").classList.contains("error")).toBe(true);
});

test("custom DNS is represented accurately and pressing the logo enables encrypted DNS", async () => {
  const ui = await setup({
    enabled: false,
    configuredResolvers: ["192.0.2.53"],
  });
  expect(ui.element("resolver-title").textContent).toBe("Custom DNS");
  expect(ui.button("toggle").getAttribute("aria-pressed")).toBe("false");
  ui.button("toggle").click();
  await settle();
  expect(ui.mutations[0].body).toEqual({ enabled: true });
});

test("an offline encrypted resolver remains switchable to automatic DNS", async () => {
  const ui = await setup({ dnscryptRunning: false });
  expect(ui.window.document.body.dataset.state).toBe("warning");
  expect(ui.element("state-label").textContent).toBe("Resolver offline");
  expect(ui.button("toggle").getAttribute("aria-label")).toBe(
    "Turn off encrypted DNS",
  );
  ui.button("toggle").click();
  await settle();
  expect(ui.mutations[0].body).toEqual({ enabled: false });
});

test("disables the logo with no active network", async () => {
  const ui = await setup({ activeService: null, activeInterface: null });
  expect(ui.element("state-label").textContent).toBe("No network");
  expect(ui.button("toggle").disabled).toBe(true);
  ui.button("toggle").click();
  expect(ui.mutations).toHaveLength(0);
});

test("unavailable status clears stale facts and disables the controls", async () => {
  const ui = await setup();
  ui.unavailable();
  await ui.poll();
  expect(ui.window.document.body.dataset.state).toBe("unavailable");
  expect(ui.element("service").textContent).toBe("—");
  expect(ui.button("toggle").disabled).toBe(true);
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
