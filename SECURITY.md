# Security

PeerHop runs an HTTP server on your local network, so security reports are
taken seriously.

## Reporting a vulnerability

Please **don't open a public issue**. Report it privately through
[GitHub's private vulnerability reporting](https://github.com/ashrafbinahmad/PeerHop/security/advisories/new)
with steps to reproduce, the affected version and platform.

You'll get a reply within a week. Fixes ship in the next release, and you'll be
credited in the release notes unless you'd rather not be.

## Scope

- The desktop app and CLI (`src/`), including the local HTTP/WebSocket server.
- The web UI served to phones and browsers (`ui/frontend`).

The security token (Settings > Security) is what stops other devices on the
same network from listing or downloading files without scanning the QR code;
bypasses of it are in scope.
