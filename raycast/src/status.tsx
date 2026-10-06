import {
  Action,
  ActionPanel,
  Color,
  Icon,
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
        message: error instanceof Error ? error.message : "DNS Control failed.",
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
        shortcut={{ modifiers: ["cmd"], key: "r" }}
      />
      {status && (
        <Action
          title={status.enabled ? "Switch to DHCP DNS" : "Enable DNS Proxy"}
          icon={Icon.Switch}
          onAction={toggle}
        />
      )}
      <Action.OpenInBrowser
        title="Open DNS Control Page"
        url={controlPageUrl}
      />
    </ActionPanel>
  );

  return (
    <List
      isLoading={loading}
      searchBarPlaceholder="DNS status"
      actions={actions}
    >
      {status ? (
        <>
          <List.Item
            title="DNS Mode"
            subtitle={status.enabled ? "DNS proxy" : "DHCP / automatic"}
            icon={{
              source: Icon.Globe,
              tintColor: status.enabled ? Color.Green : Color.SecondaryText,
            }}
            actions={actions}
          />
          <List.Item
            title="Resolver Process"
            subtitle={
              status.dnscryptRunning
                ? "dnscrypt-proxy running"
                : "dnscrypt-proxy stopped"
            }
            icon={{
              source: status.dnscryptRunning
                ? Icon.CheckCircle
                : Icon.XMarkCircle,
              tintColor: status.dnscryptRunning
                ? Color.Green
                : status.enabled
                  ? Color.Red
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
              icon={{ source: Icon.Warning, tintColor: Color.Red }}
              actions={actions}
            />
          )}
        </>
      ) : (
        <List.EmptyView
          title={error ? "DNS Control Unavailable" : "Loading DNS Status"}
          description={error}
          icon={Icon.Globe}
          actions={actions}
        />
      )}
    </List>
  );
}
