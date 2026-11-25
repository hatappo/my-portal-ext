# Repository conventions

- Write documentation, comments, tests, and commit messages in English. UI translations support English and Japanese.
- Use Conventional Commits without AI attribution.
- Run `npm run lint` before changes and `npm run check` after changes. Run `npm run test:browser` for UI or iframe lifecycle changes.
- Build the dedicated My Portal companion while preserving multiple-page support. Keep both repositories independently buildable; do not import sibling repository files. Version and test the message protocol on both sides.
- Preserve iframe security boundaries, limited permissions, and fail-closed blackout behavior.
- Do not commit generated output, credentials, or user configuration.
- Update CHANGELOG.md for releases. GitHub releases are development builds, not Chrome Web Store publication.
