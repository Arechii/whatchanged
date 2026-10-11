# whatchanged

Read the release notes for every outdated dependency, from the version you
have to the latest one.

```bash
npx whatchanged
```

Run it in a pnpm workspace. It reads `pnpm -r outdated`, finds each
package's GitHub repo, and collects the notes for every version the upgrade
passes through. Majors are listed first.

In a terminal it opens an interactive view:

| Key               | List                          | Notes                         |
| ----------------- | ----------------------------- | ----------------------------- |
| `↑` `↓` / `j` `k` | move                          | scroll                        |
| `enter` / `→`     | read the notes                |                               |
| `space` / `b`     |                               | page down / up                |
| `n` / `p`         |                               | next / previous package       |
| `g` / `G`         | first / last                  | top / bottom                  |
| `o`               | open the changes in a browser | open the changes in a browser |
| `esc` / `q`       | quit                          | back to the list              |

Piped, or with `--plain`, it prints Markdown instead, ready to paste into a
pull request:

```bash
npx whatchanged --plain > notes.md
npx whatchanged react vite     # only these packages
npx whatchanged --cwd ../app   # another workspace
```

## Where the notes come from

1. **GitHub releases** whose tag names a version in the range: `v1.2.3`,
   `1.2.3`, `pkg@1.2.3`, `@scope/pkg@1.2.3` or `pkg-v1.2.3`. In a monorepo
   whose tags name their packages, only the package's own tags count.
2. **CHANGELOG.md**, in the package's folder and then the repo root, sliced
   to the sections for the versions in range.
3. **A link** to the comparison, the changelog or the releases page, which
   `o` opens.

Packages that share a repo and an upgrade, like `@orpc/client` and
`@orpc/server`, are read once and shown together.

## GitHub token

Without a token GitHub allows 60 requests an hour, which a large workspace
can run out of. whatchanged uses `GITHUB_TOKEN` or `GH_TOKEN` when set, and
otherwise the token of a signed-in [GitHub CLI](https://cli.github.com)
(`gh auth login`). It needs no scopes: the notes it reads are public.

## Limits

- pnpm only, for now. npm and yarn workspaces are next.
- Notes are read from GitHub only. For packages elsewhere it links the
  repository or the npm page.
- pnpm reports one version per package name, so when two workspace packages
  pin different versions of a dependency, only one upgrade is shown.

## Development

```bash
pnpm install
pnpm test        # unit tests, no network
pnpm check       # oxlint, then oxfmt
pnpm typecheck
pnpm build       # bundles everything into dist/cli.mjs
node dist/cli.mjs --cwd test/e2e
```

Every user-facing change comes with a changeset (`pnpm changeset`). Merging
to `main` opens a Release pull request, and merging that publishes to npm.

## License

MIT
