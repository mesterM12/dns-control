type Status = {
  enabled: boolean;
  activeService: string | null;
  activeInterface: string | null;
  configuredResolvers: string[];
  dnscryptRunning: boolean;
  lastAction: string | null;
  lastError: string | null;
};
type Mode = "encrypted" | "automatic";

const $ = (id: string) => document.getElementById(id)!;
const encrypted = $("mode-encrypted") as HTMLButtonElement;
const automatic = $("mode-automatic") as HTMLButtonElement;
const apply = $("apply-mode") as HTMLButtonElement;
const stopProxy = $("stop-proxy") as HTMLButtonElement;
const modeDialog = $("mode-dialog") as HTMLDialogElement;
const stopDialog = $("stop-dialog") as HTMLDialogElement;
let current: Status | undefined;
let selection: Mode | null = null;
let confirmedSelection: Mode | null = null;
let dirty = false;
let busy = false;
let available = false;
let changeVersion = 0;

function modeOf(status: Status): Mode | "custom" {
  return status.enabled
    ? "encrypted"
    : status.configuredResolvers.length
      ? "custom"
      : "automatic";
}

function message(text: string | null, error = false) {
  $("message").textContent = text ?? "";
  $("message").hidden = !text;
  $("message").classList.toggle("error", error);
}

function updateControls() {
  const connected = available && Boolean(current?.activeService);
  encrypted.disabled = automatic.disabled = busy || !connected;
  encrypted.setAttribute("aria-pressed", String(selection === "encrypted"));
  automatic.setAttribute("aria-pressed", String(selection === "automatic"));
  const changed = Boolean(
    current && selection && selection !== modeOf(current),
  );
  const retry = Boolean(
    current?.enabled && !current.dnscryptRunning && selection === "encrypted",
  );
  apply.disabled = busy || !connected || !(changed || retry);
  apply.firstChild!.textContent = busy
    ? "Applying mode "
    : retry
      ? "Start resolver "
      : "Apply mode ";
  $("selection-note").textContent = busy
    ? "Updating network settings…"
    : !available
      ? "Waiting for network status."
      : !connected
        ? "Connect to a network to change DNS."
        : changed
          ? "Ready when you are."
          : retry
            ? "The local resolver is not running."
            : !selection
              ? "Select a mode to make a change."
              : "Current configuration selected.";
  stopProxy.disabled = busy || !available || !current?.dnscryptRunning;
  document.body.dataset.busy = String(busy);
}

function render(status: Status, resetSelection = false) {
  current = status;
  available = true;
  const mode = modeOf(status);
  if (!dirty || resetSelection) {
    selection = mode === "custom" ? null : mode;
    dirty = false;
  }
  const noNetwork = !status.activeService;
  const offline = status.enabled && !status.dnscryptRunning;
  document.body.dataset.state = noNetwork
    ? "unavailable"
    : offline
      ? "warning"
      : mode;
  $("resolver-title").textContent = noNetwork
    ? "Not\nconnected."
    : mode === "encrypted"
      ? "Encrypted\nDNS"
      : mode === "automatic"
        ? "Automatic\nDNS"
        : "Custom\nDNS";
  $("resolver-description").textContent = noNetwork
    ? "Connect to a network to read its DNS settings."
    : offline
      ? "Local DNS selected. The resolver is not running."
      : mode === "encrypted"
        ? "Local encrypted DNS selected."
        : mode === "automatic"
          ? "Using network-provided DNS."
          : "Using your configured DNS servers.";
  $("state-label").textContent = noNetwork
    ? "No network"
    : offline
      ? "Resolver offline"
      : mode === "encrypted"
        ? "Ward active"
        : mode === "automatic"
          ? "Automatic"
          : "Custom configuration";
  $("network-mode").textContent = noNetwork
    ? "No active network"
    : `${mode} mode`;
  $("service").textContent = status.activeService ?? "Not connected";
  $("interface").textContent = status.activeInterface ?? "—";
  $("servers").textContent =
    status.configuredResolvers.join(" · ") || "Network-provided (DHCP)";
  $("last-action").textContent = status.lastAction ?? "No changes recorded.";
  $("process").replaceChildren();
  const dot = document.createElement("span");
  dot.className = `process-dot${status.dnscryptRunning ? " running" : ""}`;
  dot.setAttribute("aria-hidden", "true");
  $("process").append(dot, status.dnscryptRunning ? "Running" : "Stopped");
  message(status.lastError, Boolean(status.lastError));
  updateControls();
}

async function refresh() {
  if (busy || modeDialog.open || stopDialog.open) return;
  const version = changeVersion;
  try {
    const response = await fetch("/api/status", {
      cache: "no-store",
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) throw new Error("Could not read network settings.");
    const status = (await response.json()) as Status;
    if (version === changeVersion) render(status);
  } catch {
    if (version !== changeVersion) return;
    available = false;
    document.body.dataset.state = "unavailable";
    $("resolver-title").textContent = "Connection\nunavailable.";
    $("resolver-description").textContent =
      "Ward could not reach its local control service.";
    $("state-label").textContent = "Unavailable";
    $("network-mode").textContent = "Status unavailable";
    $("service").textContent =
      $("interface").textContent =
      $("servers").textContent =
      $("process").textContent =
        "—";
    message(
      "Could not read network settings. Ward will try again shortly.",
      true,
    );
    updateControls();
  }
}

for (const [button, mode] of [
  [encrypted, "encrypted"],
  [automatic, "automatic"],
] as const) {
  button.addEventListener("click", () => {
    selection = mode;
    dirty = true;
    updateControls();
  });
}

apply.addEventListener("click", () => {
  if (!selection || !available || busy || apply.disabled) return;
  confirmedSelection = selection;
  const enabling = selection === "encrypted";
  $("mode-dialog-title").textContent = enabling
    ? "Select encrypted DNS?"
    : "Use automatic DNS?";
  $("mode-dialog-description").textContent = enabling
    ? "Ward will start the local encrypted resolver, check that it is ready, then select it for your active network."
    : "Your active network will use its network-provided DNS settings. The local resolver will stay ready for next time.";
  $("confirm-mode").textContent = enabling
    ? "Use encrypted DNS"
    : "Use automatic DNS";
  modeDialog.returnValue = "";
  modeDialog.showModal();
});

async function mutate(path: string, body?: { enabled: boolean }) {
  changeVersion++;
  busy = true;
  updateControls();
  message(
    path === "/api/stop-proxy"
      ? "Restoring automatic DNS and stopping the local resolver…"
      : "Applying your DNS configuration…",
  );
  try {
    const response = await fetch(path, {
      method: "POST",
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(45_000),
    });
    const status = (await response.json()) as Status;
    render(status, true);
    if (!response.ok)
      message(
        "Could not change DNS settings. " +
          (status.lastError ?? "Check the local helper and try again."),
        true,
      );
  } catch {
    available = false;
    document.body.dataset.state = "unavailable";
    $("state-label").textContent = "Check connection";
    message(
      "Could not confirm the DNS change. Refreshing your network settings…",
      true,
    );
  } finally {
    busy = false;
    updateControls();
    if (!available) void refresh();
  }
}

modeDialog.addEventListener("close", () => {
  const requested = confirmedSelection;
  confirmedSelection = null;
  if (modeDialog.returnValue === "confirm" && requested && !busy) {
    void mutate("/api/toggle", { enabled: requested === "encrypted" });
  }
});

stopProxy.addEventListener("click", () => {
  if (busy || stopProxy.disabled) return;
  stopDialog.returnValue = "";
  stopDialog.showModal();
});
stopDialog.addEventListener("close", () => {
  if (stopDialog.returnValue === "confirm" && !busy)
    void mutate("/api/stop-proxy");
});

void refresh();
window.setInterval(refresh, 20_000);
