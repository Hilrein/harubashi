---
name: git_manager
description: Guidance for using Git via `system_execute_command`. No standalone tool — read this before staging, committing, or rewriting history. Enforces a status → diff → stage → commit workflow and forbids destructive operations without explicit user confirmation.
---

## When to use this guidance

Whenever the user asks you to stage, commit, push, branch, merge, or otherwise interact with Git. All Git work is carried out via `system_execute_command`; this guidance defines the workflow.

## The mandatory workflow

Always follow this order. Never skip steps unless the user explicitly tells you to.

1. **`git status`** — understand the current branch and which files are modified, staged, or untracked. Do this **first**, every time, even if you "know" what changed.
2. **`git diff`** — inspect unstaged changes. For staged changes, use `git diff --staged`.
3. **`git add <path>`** — stage selectively. Prefer specific paths over `git add -A` or `git add .`. Stage only what belongs to the logical change you are about to commit.
4. **`git commit -m "<message>"`** — commit with a meaningful message (see below).
5. **(optional) `git log --oneline -n 5`** — verify the commit landed where you expect.

If at any step the output reveals something unexpected (untracked files you didn't create, a different branch than you thought, merge conflicts) — **stop and report to the user** instead of plowing forward.

## Commit messages — Conventional Commits

Use the [Conventional Commits](https://www.conventionalcommits.org/) prefix that matches the change:

- `feat:` — new user-visible feature
- `fix:` — bug fix
- `chore:` — tooling, dependencies, configuration
- `refactor:` — internal restructuring without behaviour change
- `docs:` — documentation only
- `test:` — tests only
- `style:` — formatting, whitespace
- `perf:` — performance improvement
- `ci:` — CI configuration

Each message must summarize **what changed and why**, not just **what changed**. Examples:

- Good: `feat(skills): add directory_explorer guidance to teach shallow-first traversal`
- Good: `fix(config): treat empty providers block as a YAML schema error`
- Bad: `update files`
- Bad: `wip`

If the change is non-trivial, add a body after a blank line:

```
fix(setup): roll back YAML on prisma db push failure

Previously, a failed `prisma db push` left the new profile in
config.yaml even though no database had been created. Now we run
DB init first and only persist the profile on success.
```

## Forbidden operations without explicit user confirmation

These rewrite or destroy work. **Never run them implicitly** — ask the user first, in plain language, and wait for an unambiguous "yes":

- `git push --force` / `git push -f` / `git push --force-with-lease`
- `git reset --hard` / `git reset --hard HEAD~N`
- `git clean -fd` / `git clean -fdx`
- `git checkout -- <path>` (discards local changes)
- `git rebase -i` / `git rebase --onto` / `git filter-branch` / `git filter-repo`
- `git commit --amend` on a commit that has already been pushed
- `git branch -D <branch>` (force-delete with unmerged commits)
- `git tag -d` / `git push --delete`

For any of the above, surface the exact command to the user and explain what it will do **before** running it.

## Branching

- Inspect first: `git branch --show-current`, `git log --oneline -n 5`.
- Create new: `git switch -c <name>` (modern) or `git checkout -b <name>` (older).
- Switch existing: `git switch <name>`.
- Naming convention: `<type>/<short-description>`, e.g. `feat/skills-auto-heal`, `fix/yaml-rollback`.

## Pushing

- Plain `git push` is safe when the branch already tracks a remote.
- First push of a new branch: `git push -u origin <name>`.
- Never `--force`. If you believe a force-push is required (rebase, history rewrite), ask the user.

## Examples

```
# Good — full happy-path workflow
git status
git diff
git add src/skills/skills.service.ts src/skills/skills-bundle.ts
git commit -m "feat(skills): auto-heal missing ~/.harubashi/skills/ from bundle"

# Good — inspecting before a risky operation
git status
git log --oneline -n 5
# (then ask the user before any reset/rebase)

# Bad — no inspection, sweeping stage, vague message
git add -A
git commit -m "stuff"
```
