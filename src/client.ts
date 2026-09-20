type Status = {
  enabled: boolean;
  activeService: string | null;
  activeInterface: string | null;
  configuredResolvers: string[];
  dnscryptRunning: boolean;
  lastAction: string | null;
  lastError: string | null;
};

const $ = (id: string) => document.getElementById(id)!;
const toggle = $("toggle");
const stopProxy = $("stop-proxy") as HTMLButtonElement;
const stopDialog = $("stop-dialog") as HTMLDialogElement;
const confirmStop = $("confirm-stop") as HTMLButtonElement;
let current: Status | undefined;

function render(status: Status) {
  current = status;
  const available = status.dnscryptRunning;
  $("button-label").textContent = status.enabled ? "DNS proxy" : "DHCP DNS";
  $("mode").textContent = status.enabled ? "Heartbeat active" : "DHCP mode";
  $("service").textContent = status.activeService ?? "No network";
  $("detail").textContent = status.lastError ?? "";
  $("detail").classList.toggle("error", Boolean(status.lastError));
  $("detail").hidden = !status.lastError;
  toggle.disabled = false;
  toggle.setAttribute("aria-pressed", String(status.enabled));
  toggle.setAttribute("aria-label", status.enabled ? "Switch to DHCP DNS" : "Switch to DNS proxy");
  toggle.classList.toggle("on", status.enabled);
  stopProxy.disabled = !available;
}

async function refresh() {
  try {
    const response = await fetch("/api/status", { cache: "no-store" });
    if (!response.ok) throw new Error("Unable to read DNS status.");
    render(await response.json());
  } catch (error) {
    $("detail").textContent = error instanceof Error ? error.message : "Unable to read DNS status.";
    $("detail").classList.add("error");
  }
}

toggle.addEventListener("click", async () => {
  if (!current) return;
  const enabled = !current.enabled;
  toggle.disabled = true;
  toggle.classList.add("loading");
  $("button-label").textContent = "Switching";
  $("mode").textContent = "Confirm to continue";
  $("detail").textContent = "Confirm the system prompt to apply this DNS change.";
  $("detail").hidden = false;
  try {
    const response = await fetch("/api/toggle", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled }),
    });
    render((await response.json()) as Status);
  } catch (error) {
    $("detail").textContent = error instanceof Error ? error.message : "The DNS change failed.";
    $("detail").classList.add("error");
    toggle.disabled = false;
  } finally {
    toggle.classList.remove("loading");
  }
});

stopProxy.addEventListener("click", () => stopDialog.showModal());

stopDialog.addEventListener("close", async () => {
  if (stopDialog.returnValue !== "confirm") return;
  stopProxy.disabled = true;
  $("detail").textContent = "Stopping DNS proxy.";
  $("detail").hidden = false;
  try {
    const response = await fetch("/api/stop-proxy", { method: "POST" });
    render((await response.json()) as Status);
  } catch (error) {
    $("detail").textContent = error instanceof Error ? error.message : "The DNS proxy could not be stopped.";
    $("detail").classList.add("error");
    stopProxy.disabled = false;
  }
});

refresh();
window.setInterval(refresh, 20_000);
