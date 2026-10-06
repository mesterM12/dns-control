# DNS Control

Local macOS controls for switching the active network service between a loopback `dnscrypt-proxy` resolver and DHCP DNS.

- A loopback-only Bun control panel at `http://127.0.0.1:43173`
- A Raycast extension for viewing DNS status, toggling the DNS proxy, or opening the panel
- A root-owned helper restricted to the exact `enable`, `disable`, and `stop` DNS actions

No resolver URLs, API keys, or credentials are stored in this repository.

## Requirements

- macOS
- [Bun](https://bun.sh/)
- Homebrew `dnscrypt-proxy` configured to listen on `127.0.0.1` and `::1`
- Raycast, optionally

## Install

```sh
bun run install:helper
bun run install:agent
```

`install:helper` asks for macOS administrator approval once. It installs a root-owned helper and validates a narrowly scoped `/etc/sudoers.d/dns-control` rule. Ordinary toggles never store or request credentials.

`install:agent` creates a user LaunchAgent using the current Bun executable and repository location.

## Development

```sh
bun run check
bun run start
```

The browser client is authored in TypeScript and emitted as a small static bundle during `bun run build`.

### Raycast

```sh
cd raycast
npm ci
npx ray develop
```

Raycast imports the extension when development mode starts. It remains available after the command stops.

## Security Model

The web server binds only to `127.0.0.1` and `::1`, rejects cross-origin mutations, and does not expose a remote API. The privileged helper has fixed arguments, independently selects the default network service, and is installed as `root:wheel`; review `privileged/dns-control-helper` before running the installer.
