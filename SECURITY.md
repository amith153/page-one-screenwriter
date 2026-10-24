# Security

## Reporting a problem
Please report security issues privately with the "Report a vulnerability" button on the repository's Security tab, not in a public issue.

## What is and is not in this repository
- No API keys, server addresses, OAuth client IDs, signing keys or personal data are stored here, and none are built into the downloads on the Releases page.
- Google Drive and film stills need keys that only the person building the app has. Copy `.env.example` to `.env.local` (git-ignored) and fill in your own. The downloadable builds run without them, with those features switched off.
- A pre-commit hook in `.githooks/` refuses commits that contain key-shaped text. Turn it on with `git config core.hooksPath .githooks`.

