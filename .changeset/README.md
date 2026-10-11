# Changesets

Every pull request with a user-facing change adds one: run `pnpm changeset`,
pick the bump, and write the line users will read in the release notes.
Merging to `main` opens a Release pull request that versions the package;
merging that publishes it to npm and creates the GitHub release.
