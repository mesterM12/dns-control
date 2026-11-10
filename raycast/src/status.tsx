import {
  Action,
  ActionPanel,
  Color,
  Icon,
  Keyboard,
  List,
  showToast,
  Toast,
} from "@raycast/api";
import { useEffect, useState } from "react";
import {
  controlPageUrl,
  DnsStatus,
  getStatus,
  setEnabled,
} from "./dns-control";

export default function Command() {
  const [status, setStatus] = useState<DnsStatus>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();

  async function refresh() {
    setLoading(true);
    try {
      setStatus(await getStatus());
      setError(undefined);
    } catch (error) {
      setStatus(undefined);
      setError(
        error instanceof Error ? error.message : "Unable to read DNS status.",
      );
    } finally {
      setLoading(false);
    }
  }

  async function toggle() {
    if (!status || loading) return;
    setLoading(true);
    try {
      await setEnabled(!status.enabled);
    } catch (error) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Unable to change DNS",
        message: error instanceof Error ? error.message : "Ward failed.",
      });
    } finally {
      await refresh();
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  const actions = (
    <ActionPanel>
      <Action
        title="Refresh Status"
        icon={Icon.ArrowClockwise}
        onAction={refresh}
        shortcut={Keyboard.Shortcut.Common.Refresh}
      />
      {status && (
        <Action
          title={status.enabled ? "Use Automatic DNS" : "Use Encrypted DNS"}
          icon={Icon.Switch}
          onAction={toggle}
        />
      )}
      <Action.OpenInBrowser title="Open Ward Panel" url={controlPageUrl} />
    </ActionPanel>
  );

  return (
    <List
      isLoading={loading}
      searchBarPlaceholder="Ward · network status"
      actions={actions}
    >
      {status ? (
        <>
          <List.Item
            title="Resolver Mode"
            subtitle={
              status.enabled
                ? "Encrypted DNS"
                : status.configuredResolvers.length
                  ? "Custom DNS"
                  : "Automatic DNS"
            }
            icon={{
              source: Icon.Globe,
              tintColor: status.enabled ? "#C3F58A" : Color.SecondaryText,
            }}
            actions={actions}
          />
          <List.Item
            title="Resolver Process"
            subtitle={
              status.dnscryptRunning
                ? "Local resolver running"
                : "Local resolver stopped"
            }
            icon={{
              source: status.dnscryptRunning
                ? Icon.CheckCircle
                : Icon.XMarkCircle,
              tintColor: status.dnscryptRunning
                ? "#C3F58A"
                : status.enabled
                  ? "#ED896F"
                  : Color.SecondaryText,
            }}
            actions={actions}
          />
          <List.Item
            title="Active Network"
            subtitle={status.activeService ?? "No active network"}
            accessories={
              status.activeInterface ? [{ text: status.activeInterface }] : []
            }
            icon={Icon.Network}
            actions={actions}
          />
          <List.Item
            title="Configured DNS Servers"
            subtitle={
              status.configuredResolvers.join(", ") || "Automatic (DHCP)"
            }
            icon={Icon.Globe}
            actions={actions}
          />
          {status.lastAction && (
            <List.Item
              title="Last Action"
              subtitle={status.lastAction}
              icon={Icon.Clock}
              actions={actions}
            />
          )}
          {status.lastError && (
            <List.Item
              title="Last Error"
              subtitle={status.lastError}
              icon={{ source: Icon.Warning, tintColor: "#ED896F" }}
              actions={actions}
            />
          )}
        </>
      ) : (
        <List.EmptyView
          title={error ? "Ward Unavailable" : "Reading Network Settings"}
          description={error}
          icon={Icon.Globe}
          actions={actions}
        />
      )}
    </List>
  );
}
