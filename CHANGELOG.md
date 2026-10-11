# @arechi/whatchanged

## 0.1.1

### Patch Changes

- cf2460c: When paging through a busy repo stops before reaching your version and no CHANGELOG.md covers the upgrade, the notes now say older releases were not read, instead of only "No release notes found".

## 0.1.0

### Minor Changes

- First release. `npx @arechi/whatchanged` lists the outdated dependencies of a pnpm workspace with the GitHub release notes or CHANGELOG.md sections between the installed and the latest version, in an interactive view or as Markdown when piped.
