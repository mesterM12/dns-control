# Ward — Brand identity

A quiet protective sigil for a precise macOS network utility. Ward's identity is a geometric W inside an interrupted seal, shared across the browser panel, favicon and Raycast extension. It lights in Poisoned Sage when the local encrypted DNS resolver is selected and running. Automatic mode uses an unlit outline; it is an ordinary network configuration, not an alarm.

## Palette

- Void `#080B0B`: primary background
- Obsidian `#121817`: panels and controls
- Poisoned Sage `#C3F58A`: active configuration, selection and sigil
- Ash `#8B9E96`: secondary text
- Bone `#F3F5EF`: primary text
- Ember `#ED896F`: errors and warnings

Use the accent sparingly. Interrupted paths, thin seals and deliberate spacing give the interface its character. Avoid heartbeat imagery, shields, padlocks, hacker clichés and excessive glow.

## Typography

Geist for application typography; JetBrains Mono for network facts, small labels and diagnostics. Both fonts are served locally, with their SIL Open Font Licenses in `public/fonts`. The interface makes no external font requests.

## Interaction and voice

Current configuration, choose a mode, confirm. Network details and stopping the resolver are secondary. Selected controls show the pending choice; the current-resolver heading and sigil always show the observed configuration. Custom DNS and an offline resolver are represented explicitly. Errors never claim that the previous configuration was restored unless that is known.

Ward is a small, competent guardian: slightly eerie, always clear. Primary tagline: “A little magic between you and the wire.” DNS encryption is scoped to the configured local resolver and never presented as protection for all network traffic.

The public product name is Ward. Existing repository names, helper paths, service labels and local API addresses remain stable so a visual update does not migrate privileged infrastructure.
