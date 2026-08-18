# Contributing

## Commit messages

Subjects follow [Conventional Commits](https://www.conventionalcommits.org):

```
type(optional-scope)!: description
```

Bodies do not change. This repository has always explained *why* a change is
right rather than restating the diff, and that is the part worth keeping — the
subject line simply gains a prefix that a tool can read.

| Part | Rule |
| --- | --- |
| `type` | one of `build` `chore` `ci` `docs` `feat` `fix` `perf` `refactor` `revert` `style` `test` |
| `scope` | optional, lower case: `api` `components` `hooks` `lib` `styles` `testing` `build` `deps` `ci` |
| `!` | append to the type or scope for a breaking change, and explain it in a `BREAKING CHANGE:` footer |
| `description` | lower case, imperative, no trailing full stop, whole subject within 72 characters |
| body | separated by one blank line, wrapped at 72, present for anything not self-evident |

Footers, where they apply: `Fixes: #123`, `Refs: #123`, `BREAKING CHANGE: ...`.

```
fix(hooks): scope the optimistic snapshot to the relay being written

onMutate snapshotted the whole relay collection and onError restored it
whole, so two writes in flight restored each other's optimistic values —
and the UI could settle on a state the hub never reported, under a banner
claiming it was the hub's last word.

Fixes: #13
```

### Enable the hook

Once per clone:

```bash
git config core.hooksPath .githooks
git config commit.template .gitmessage
```

`.githooks/commit-msg` rejects a message that does not fit. It is a plain
POSIX shell script rather than commitlint, so it is identical to the one the
sibling repositories use and adds no dependency to `package.json`; CI runs that
same file over every commit in a pull request.

### Why this changed

The history before this point uses capitalised, prefix-free subjects in Git's
own style. Those commits are left alone: rewriting them would change every hash
and break the links from issues and pull requests. The log therefore has a
visible seam, which is the honest cost of the change.

What it buys is release automation. The version had sat at `0.1.0` with no
tags, no releases and no changelog; `.github/workflows/release.yml` now derives
all three from the commit types.
