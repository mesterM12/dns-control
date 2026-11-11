# Running Ward

[← Back to the README](../README.md)

## Use your own resolver configuration

Ward works with a reviewed dnscrypt-proxy configuration. The [included Cloudflare example](../examples/cloudflare-doh.toml) is optional; you can select another provider, filtering policy or route.

Your configuration must:

- Listen on **`127.0.0.1:53` and `[::1]:53`**, over both UDP and TCP. Wildcard listeners do not pass the helper's ownership checks.
- Pass `dnscrypt-proxy -config /absolute/path/to/config.toml -check` as your regular user.
- Use absolute paths for **every file reference**, including rule files, certificates, source caches and logs. The stock upstream sample includes relative paths and must be adapted.
- Keep supporting input files at their reviewed locations, with root ownership and appropriate permissions. The installer copies only the binary and TOML file. External cache/log directories must exist and be accessible to the service.
- Keep listener ownership with the launchd process. The supplied example does not configure privilege dropping or a separate child listener process.

Review provider privacy policies yourself. A DNS stamp identifies an endpoint and its declared properties; it is not independent evidence of the provider's practices. The starter example uses a static public stamp with an upstream IP, avoiding bootstrap DNS and external resolver-list caches. It requires IPv4 connectivity to that upstream even though it accepts local queries over IPv6.

For example, with a mise-managed executable already installed:

```sh
bun run install:resolver \
  --binary "$(mise which dnscrypt-proxy)" \
  --config /absolute/path/to/your-reviewed-config.toml
```

Run this from the Ward checkout. Do not commit your personal configuration, tokens, certificates, logs or `state.json`. The installer avoids printing configuration contents, including when validation fails.

## Troubleshooting

### The panel does not open

Confirm you built the client and reinstall the panel agent from the checkout:

```sh
bun run build
bun run install:agent
open http://127.0.0.1:43173
```

Check `logs/launchd.err.log` locally for startup errors. If you moved the checkout or changed the Bun executable path, reinstall the agent: it remembers both absolute paths. A second foreground server on port 43173 can also prevent startup.

### Encrypted DNS will not turn on

Ward fails the switch if the resolver cannot answer, lacks either loopback listener or does not own the listeners itself. Check your internet connection, provider configuration and any conflicting DNS service. Review `/var/log/dns-control-resolver.error.log` and `/var/log/dns-control-resolver.log` locally. An initial upstream connection can fail on a captive portal; return to automatic DNS and complete the network's sign-in first.

Read-only checks:

```sh
sudo launchctl print system/com.local.dnscrypt-proxy
sudo lsof -nP -iTCP:53 -iUDP:53
```

An unloaded service will not appear in `launchctl print`. Do not kill an unfamiliar process just because it uses port 53.

### Another resolver or VPN is already running

Ward needs exclusive ownership of its two loopback DNS endpoints. If you previously started Homebrew's dnscrypt-proxy service, stop that service using the same account/context that started it before enabling Ward. For a service you intentionally ran as root, the matching command is `sudo brew services stop dnscrypt-proxy`; for a user service it is `brew services stop dnscrypt-proxy`.

A VPN may own the default route or enforce its own DNS. Ward may show no matching network service or refuse to switch. Disconnect the VPN to test a normal Wi-Fi/Ethernet connection, or use the VPN's DNS controls. Ward does not override managed profiles or configure every network service at once. Recheck Ward after changing networks.

### Helper authorization fails

From the checkout, reinstall the narrow helper and its validated sudoers rule:

```sh
bun run install:helper
```

Approve the macOS administrator prompt. This updates the helper only; it does not install or replace the resolver. The authorization is for the macOS user who runs the installer.

### Recover internet access without the panel

Use **Automatic DNS** or **Stop resolver** if the panel is available. Otherwise, restore automatic DNS directly in Terminal. First list your service names:

```sh
networksetup -listallnetworkservices
```

Then substitute the exact affected service name below (for example, `Wi-Fi` or `Ethernet`):

```sh
sudo networksetup -setdnsservers "Wi-Fi" Empty
```

`Empty` removes manual DNS entries and returns that service to network-provided DNS. If you previously used custom static DNS, re-enter the addresses you recorded before installing Ward. Repeat for any other service you previously switched. This recovery does not require Ward or its helper to be running.

### The installer says a configuration already exists

This safeguard prevents silent replacement of `/Library/Application Support/DNS Control/dnscrypt-proxy.toml`. Do not delete the file as a quick fix: review and back it up locally. Follow the resolver replacement steps below if you intend to replace it.

Keep diagnostic logs private and redact personal paths, network details and provider credentials before sharing an issue.

## Updates

### Update the panel and helper

With a clean checkout, run from the repository folder:

```sh
git pull --ff-only
bun install --frozen-lockfile
bun run build
bun run install:helper
bun run install:agent
```

Review upstream changes before installing the privileged helper. `install:helper` asks for administrator approval. If you use Raycast, run `npm ci` and `npm run dev` again from `raycast/` to refresh its installed extension; stop the watcher after it registers.

Homebrew or mise upgrades do **not** update Ward's deployed resolver binary/configuration snapshot.

### Replace the deployed resolver

1. Choose **Stop resolver**, confirm automatic DNS and working connectivity, and review the new executable/configuration. Avoid doing this during a network transition.
2. Back up the deployed configuration **outside the repository**, keeping it readable only by root. For example, `sudo cp -p "/Library/Application Support/DNS Control/dnscrypt-proxy.toml" "/Library/Application Support/DNS Control/dnscrypt-proxy.toml.backup"`. This overwrites an older backup with that name, so choose a new name if you need to retain it.
3. After confirming the backup, remove only the deployed TOML with `sudo rm "/Library/Application Support/DNS Control/dnscrypt-proxy.toml"`.
4. Run `bun run install:resolver` with the reviewed binary and configuration paths, as in the README. It installs a new snapshot and leaves it disabled. If installation fails, stay on automatic DNS while you fix it; the backup preserves your old settings.
5. Enable from the panel and verify both loopback DNS queries before relying on it.

Do not run the installer on top of a running resolver or copy a user-writable executable into the root service by hand. Keep backups private; they may contain credentials.

## Installed files

| Location | Purpose |
| --- | --- |
| Your Ward checkout | Panel source, built browser assets, local state and panel logs |
| `~/Library/LaunchAgents/com.local.dns-control.plist` | Starts the panel immediately and at user login |
| `/Library/Application Support/DNS Control/` | Root-owned resolver binary and private TOML snapshot |
| `/Library/LaunchDaemons/com.local.dnscrypt-proxy.plist` | Dedicated resolver service |
| `/usr/local/libexec/dns-control-helper` | Restricted root-owned DNS helper |
| `/etc/sudoers.d/dns-control` | Installing user's authorization for three helper actions |
| `/var/log/dns-control-resolver*.log` | Resolver output and errors |
| `~/.config/raycast/extensions/dns-control/` | Local Raycast extension, after import |

## Foreground development

Stop the user panel agent before running a foreground server; this does not stop the resolver or change DNS:

```sh
launchctl bootout "gui/$(id -u)/com.local.dns-control"
bun run build
bun run start
```

If the agent was not loaded, `bootout` reports that it cannot find the service; continue. After stopping the foreground server with Ctrl-C, run `bun run install:agent` to restore the login service. The ordinary foreground panel controls **real system DNS** when you click it.

## Uninstall

First choose **Stop resolver** and verify automatic DNS works. If the panel is unavailable, restore DNS using the recovery instructions above, then disable and unload the dedicated daemon:

```sh
sudo launchctl disable system/com.local.dnscrypt-proxy
sudo launchctl bootout system/com.local.dnscrypt-proxy
```

If Stop resolver already unloaded it, `bootout` will report that the service is not found. Confirm it is unloaded before removing the executable. Then remove Ward's two launchd definitions, helper and sudoers rule:

```sh
launchctl bootout "gui/$(id -u)/com.local.dns-control"
rm "$HOME/Library/LaunchAgents/com.local.dns-control.plist"
sudo rm /Library/LaunchDaemons/com.local.dnscrypt-proxy.plist
sudo rm /usr/local/libexec/dns-control-helper
sudo rm /etc/sudoers.d/dns-control
```

Remove **Ward** in Raycast Settings → Extensions if installed. After privately backing up any configuration you want to keep, remove the following Ward-owned items in Finder (use **Go → Go to Folder** for system paths, with administrator approval):

- `/Library/Application Support/DNS Control/`
- `/var/log/dns-control-resolver.log` and `/var/log/dns-control-resolver.error.log`
- The Ward checkout, including its local state and logs

Bun, Node.js, Homebrew and their dnscrypt-proxy package remain available for other tools. Re-enable a previous resolver service only if you intentionally want it to manage DNS again.

## Screenshot provenance

The README screenshots were captured from Ward's actual HTML, CSS, fonts and built client using a temporary loopback-only preview with synthetic API responses. The values `Wi-Fi`, `en0`, `127.0.0.1` and `::1` are sample data. No real provider settings, credentials or machine logs were used, and capturing the states did not change system DNS.
