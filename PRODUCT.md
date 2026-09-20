# Product

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

Loopback-only, no login, no persisted credentials, no remote operation, and no modification to DNS resolver configuration beyond system DNS servers. Uses the existing Homebrew dnscrypt-proxy process.

## Product Principles

Keep the control immediate, expose current resolver facts, keep privileged work narrowly scoped, and leave dnscrypt-proxy running for fast re-enable.
