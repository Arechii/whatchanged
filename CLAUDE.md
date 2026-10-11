# CLAUDE.md

`whatchanged` prints the release notes between the installed and the latest
version of every outdated dependency in a pnpm workspace.

Rules that are not visible from the code:

- **Nothing goes in `dependencies`.** The build bundles every runtime package
  into `dist/`, so `npx whatchanged` installs one package. Runtime packages
  are `devDependencies`.
- **Node 22 is the floor.** `@types/node` stays on 22 so an API newer than
  that fails the typecheck instead of a user's run.
- **Commit messages are a subject line.** Every commit passes lint, typecheck
  and tests on its own.
