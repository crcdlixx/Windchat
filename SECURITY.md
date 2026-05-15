# Security Policy

## Supported Versions

WindChat has not published a stable release series yet. Security fixes target the `main` branch until versioned releases are introduced.

## Reporting a Vulnerability

Please do not open a public issue for sensitive security reports. Contact the repository owner privately through GitHub, and include:

- Affected version or commit.
- Steps to reproduce.
- Impact and any known workarounds.

## Current Security Boundary

- Private chat text is encrypted in the browser with Signal Protocol.
- Group chat text, attachment contents, and notes are not end-to-end encrypted yet.
- Signal private key material and session state are stored in browser `localStorage`.
- A new browser/device creates a new Signal identity bundle; old sessions are not automatically synchronized.

Do not present the project as suitable for high-risk communications until those limitations are addressed.
