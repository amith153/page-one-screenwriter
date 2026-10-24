# Contributing to Page One

Thanks for helping. A few things keep the project healthy.

## Getting set up

```bash
npm install
git config core.hooksPath .githooks   # turns on the secret check before each commit
npm run tauri dev                      # the desktop app, with live reload
```

You need Node 20+ and stable Rust. See [README › For developers](README.md#17-for-developers).

## Keys stay out of the repository

Page One builds without any keys: it writes, exports and passes drafts. Google Drive and film stills switch on only when a build has keys.

- Put your own keys in `.env.local` (copy `.env.example`). It is git-ignored.
- Never commit `.env*` files, `client_secret*.json`, `google-services.json`, `collab.properties` or signing keys. `.gitignore` excludes them, and the pre-commit hook in `.githooks/` refuses key-shaped text.
- Never add a settings field that asks writers for a key or server.

If a key is ever committed, rotate it at once; deleting the commit is not enough.

## Before you open a pull request

- `npm test` passes, and `npx tsc -b` and `npm run lint` show no errors.
- The core (`src/core/`) is a line-for-line port of the Android app's core and shares its tests. If you change a rule there, keep `core.test.ts` in step and say so in the pull request.
- Try the change in the built app (`npm run tauri build`), not only in the browser: drag and drop, file dialogs and sign-in behave differently in the desktop webview.
- Keep each action in one place in the UI, and match the surrounding code's style.

## Content

Don't add copyrighted screenplay text, film stills or fonts without a licence that allows it. The structure examples are written in our own words for that reason.

By contributing you agree your work is released under the [MIT License](LICENSE).
