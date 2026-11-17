# Contributing

1. Branch off `develop`: `git checkout -b feature/my-change develop`.
2. Make your change and run the checks:
   ```bash
   pnpm typecheck && pnpm test
   cargo fmt --manifest-path src-tauri/Cargo.toml --all
   cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
   pnpm test:e2e
   ```
3. Open a PR into `develop`. CI must be green before merging.
4. Releases: open a PR from `develop` to `main`. Once it's merged, tag `main` with `vX.Y.Z` and push the tag. The release workflow does the rest.

Use [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `chore:`…) so the generated release notes read well.

## Recommended branch protection (GitHub → Settings → Branches)

- `main`: require a PR, require the CI checks (`Frontend`, `Rust · *`, `E2E · UI`, `E2E · desktop app`), no direct pushes.
- `develop`: require the CI checks.
