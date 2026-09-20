import { closeMainWindow, showHUD, showToast, Toast } from "@raycast/api";
import { getStatus, setEnabled } from "./dns-control";

export default async function command() {
  await closeMainWindow();

  try {
    const status = await getStatus();
    const enabled = !status.enabled;
    let actionError: unknown;
    try {
      await setEnabled(enabled);
    } catch (error) {
      actionError = error;
    }
    const updatedStatus = await getStatus();

    if (actionError) throw actionError;
    await showHUD(
      updatedStatus.enabled ? "DNS proxy enabled" : "DHCP DNS enabled",
    );
  } catch (error) {
    await showToast({
      style: Toast.Style.Failure,
      title: "DNS Control failed",
      message:
        error instanceof Error
          ? error.message
          : "Unable to change DNS settings.",
    });
  }
}
