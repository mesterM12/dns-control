import { closeMainWindow, showHUD, showToast, Toast } from "@raycast/api";
import { getStatus, setEnabled } from "./dns-control";

export async function runModeCommand(requested?: boolean) {
  await closeMainWindow();
  try {
    const before = await getStatus();
    const enabled = requested ?? !before.enabled;
    await setEnabled(enabled);
    const after = await getStatus();
    if (
      after.enabled !== enabled ||
      (enabled && !after.dnscryptRunning) ||
      (!enabled && after.configuredResolvers.length > 0)
    ) {
      throw new Error("The requested DNS mode could not be confirmed.");
    }
    await showHUD(
      enabled ? "Ward: encrypted DNS selected" : "Ward: automatic DNS selected",
    );
  } catch (error) {
    await showToast({
      style: Toast.Style.Failure,
      title: "Could not change DNS settings",
      message:
        error instanceof Error
          ? error.message
          : "Ward could not apply the requested mode.",
    });
  }
}
