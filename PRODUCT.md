# Ward

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Delegated: Bun's built-in HTTP server with static HTML, CSS, and TypeScript to minimize local overhead.

## Users

The Mac's local user toggling private DNS during ordinary network use without opening Terminal. Inferred from the implementation request.

## Product Purpose

Switch the active macOS network service between the already-installed local dnscrypt-proxy resolver and DHCP-provided DNS. Success is a reliable, visible switch with a narrowly scoped root helper installed once.

## Positioning

It controls the system DNS setting for the currently routed network service rather than a hard-coded adapter.

## Capabilities and Constraints

Loopback-only, no login, no persisted credentials and no remote operation. Runtime controls change only system DNS servers and the dedicated resolver service state. A reviewed resolver configuration and immutable root-owned resolver binary are installed separately, using a mise-managed executable as the preferred source rather than invoking Homebrew services as root.

## Product Principles

Show the observed DNS configuration clearly, confirm mode changes, keep network diagnostics secondary, and keep privileged work narrowly scoped. Use a restrained geometric sigil and the Poisoned Sage palette; automatic DNS remains a normal, neutral state.
