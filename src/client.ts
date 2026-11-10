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
const toggle = $("toggle") as HTMLButtonElement;
const stopProxy = $("stop-proxy") as HTMLButtonElement;
const stopDialog = $("stop-dialog") as HTMLDialogElement;
let current: Status | undefined;
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
  toggle.disabled = busy || !connected;
  toggle.setAttribute("aria-pressed", String(Boolean(current?.enabled)));
  toggle.setAttribute("aria-busy", String(busy));
  toggle.setAttribute(
    "aria-label",
    busy
      ? "Changing DNS mode"
      : current?.enabled
        ? "Turn off encrypted DNS"
        : "Turn on encrypted DNS",
  );
  $("toggle-hint").textContent = busy
    ? "Changing your DNS configuration…"
    : !available
      ? "Waiting for network status."
      : !connected
        ? "Connect to a network to change DNS."
        : current?.enabled
          ? "Click the sigil to use automatic DNS."
          : "Click the sigil to turn on encrypted DNS.";
  stopProxy.disabled = busy || !available || !current?.dnscryptRunning;
  document.body.dataset.busy = String(busy);
}

function render(status: Status) {
  current = status;
  available = true;
  const mode = modeOf(status);
  const noNetwork = !status.activeService;
  const offline = status.enabled && !status.dnscryptRunning;
  document.body.dataset.state = noNetwork
    ? "unavailable"
    : offline
      ? "warning"
      : mode;
  $("resolver-title").textContent = noNetwork
    ? "Not connected."
    : mode === "encrypted"
      ? "Encrypted DNS"
      : mode === "automatic"
        ? "Automatic DNS"
        : "Custom DNS";
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
  if (busy || stopDialog.open) return;
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
    $("resolver-title").textContent = "Connection unavailable.";
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

toggle.addEventListener("click", () => {
  if (!current || !available || busy || toggle.disabled) return;
  void mutate("/api/toggle", { enabled: !current.enabled });
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
    render(status);
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
