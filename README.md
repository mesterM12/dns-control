# Ward

A little magic between you and the wire.

Local macOS controls for switching the active network service between a loopback `dnscrypt-proxy` resolver and DHCP DNS.

- A Ward control panel with a large circular sigil for one-click DNS toggling at `http://127.0.0.1:43173`
- Ward commands in Raycast: Status, Toggle DNS, Encrypted, Automatic and Open Panel
- A root-owned helper restricted to the exact `enable`, `disable`, and `stop` DNS actions

No resolver URLs, API keys, or credentials are stored in this repository.

## Requirements

- macOS
- [Bun](https://bun.sh/)
- Latest `dnscrypt-proxy` (mise is preferred), with reviewed configuration listening on `127.0.0.1:53` and `[::1]:53`
- Raycast, optionally

## Install

```sh
bun run install:resolver --binary "$(mise which dnscrypt-proxy)" --config /path/to/reviewed-dnscrypt-proxy.toml
bun run install:agent
```

`install:resolver` validates the supplied configuration as the current user, then asks once for macOS administrator approval to install the resolver binary/configuration into `/Library/Application Support/DNS Control`, the narrow helper and its validated sudoers rule. It writes a dedicated `com.local.dnscrypt-proxy` LaunchDaemon but leaves it disabled and unloaded. It does not change system DNS. An existing installed resolver configuration is never overwritten automatically. This root-owned snapshot is intentionally separate from mise's user-writable installation; use a reviewed upgrade procedure when updating the resolver.

The separate `install:helper` command remains available to update only the root-owned helper and narrowly scoped `/etc/sudoers.d/dns-control` rule. Ordinary toggles never store or request credentials.

`install:agent` creates a user LaunchAgent using the current Bun executable and repository location.

## Development

```sh
bun install --frozen-lockfile
bun run check
bun run start
```

The browser client is authored in TypeScript and emitted as a small static bundle during `bun run build`.

The helper enables the dedicated resolver service only when you explicitly enable DNS in the app, verifies that its process owns both loopback DNS listeners over UDP and TCP, and checks DNS responses before redirecting system DNS. Disable restores DHCP DNS and leaves the resolver ready for reuse. Stop restores DHCP DNS, unloads only the dedicated DNS Control service and disables it across restarts; it never kills unrelated resolver processes.

Supply your reviewed resolver configuration as a local file; its contents are never printed by the installer. The repository does not contain a previous resolver/provider configuration and does not silently choose public upstream defaults. Review provider/route settings before installation, and ensure the listeners are `127.0.0.1:53` and `[::1]:53`.

All configured file references must use absolute paths, including rule files, certificates, resolver source caches and log files. Supporting files are not copied with the TOML file. Install and review those files separately at their intended locations, ensure the resolver can access them, and avoid writable input files when the resolver runs as root. The installer rejects relative file references before asking for administrator approval so moving the configuration cannot silently change their meaning.

Run installer and helper regression checks without touching live services or DNS:

```sh
bun run test
```

### Raycast

```sh
cd raycast
npm ci
npx ray develop
```

Raycast imports the extension when development mode starts. It remains available after the command stops.

The extension is named Ward. This is a local-only extension. Run `npm run lint` in `raycast` to check the source with Raycast's ESLint rules and Prettier without requiring a Raycast Store profile. The optional `npm run lint:store` command also validates Store metadata and requires a real Raycast username in the manifest's `author` field before publication.

## Security Model

The web server binds only to `127.0.0.1` and `::1`, rejects cross-origin mutations, and does not expose a remote API. The privileged helper has fixed arguments, independently selects the default network service, and is installed as `root:wheel`; review `privileged/dns-control-helper` before running the installer.
