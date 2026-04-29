# CLAUDE.md

Project-specific instructions for Claude Code working on this repository. Read this file at the start of every session.

## Project

**udf-viewer** — A cross-platform desktop viewer for Turkey's UYAP `.udf` document format. Built with Tauri 2 + vanilla HTML/CSS/JS. Read-only. MIT licensed.

The full multi-stage technical brief is in `CLAUDE_CODE_BRIEF.md`. Always consult it before starting any task.

## Development workflow — non-negotiable rules

### 1. Test-Driven Development (TDD)

We follow TDD strictly. The cycle is:

1. **Red** — Write a failing test first that describes the behavior you want.
2. **Green** — Write the minimum code to make the test pass.
3. **Refactor** — Clean up, keeping tests green.

Concrete rules:

- **Never write production code without a failing test that requires it.** If a test passes the moment you write it, you wrote the production code first — back up.
- For each new function or behavior, the first commit on the branch must be a failing test. The second commit makes it pass.
- Tests live in `test/` (Node) or are colocated `.test.js` files for the parser. UI behavior is verified manually for v1; we don't have e2e tooling yet.
- Run the full test suite before every commit: `npm test`. Do not commit if anything is red.
- Test names describe behavior, not implementation: `parses CDATA text into runs` ✓ — not `test_function_x` ✗.
- One assertion concept per test. Multiple `expect`/`assert` calls are fine if they verify the same concept.
- Test fixtures use the real sample files in `samples/`. Don't fabricate UDF XML — the format has too many quirks; use real data.

### 2. Branch-per-change

- **Never commit directly to `main`.** `main` is protected; all changes arrive via pull requests.
- One branch per logical change. Branches are short-lived (hours to a day or two, not weeks).
- Branch naming: `<type>/<short-kebab-description>`
  - `feat/cdata-text-extraction`
  - `feat/paragraph-style-resolution`
  - `fix/negative-color-int-handling`
  - `chore/tauri-config-icons`
  - `test/parser-table-fixtures`
  - `docs/readme-installation-section`
- Create the branch before writing code: `git checkout -b feat/whatever`. Never modify `main` locally then "figure out" the branch later.

### 3. Pull Requests

- Every branch becomes a PR. No direct merges.
- PR title follows Conventional Commits format (see below): `feat(parser): extract CDATA text into runs`
- PR description must include:
  - **What** changed (bullet list)
  - **Why** (link to brief stage or issue if relevant)
  - **How tested** (which tests were added or updated, manual test steps if UI)
  - **Screenshots** for any UI change
- Run `npm test` before opening the PR — paste the green output in the PR description.
- Use `gh pr create` to open PRs from the CLI. Use `--fill` only if the branch's commits already follow Conventional Commits format perfectly; otherwise, write the PR body explicitly.
- Self-review the diff in the PR view before requesting review. Often catches things `git diff` in terminal misses.
- Squash-merge by default. Keeps `main` history clean. Exception: when a feature legitimately consists of multiple independent commits worth preserving (rare).
- After merge, delete the branch locally and on remote.

### 3.1. Automated PR review

Once Stage 3 is complete, every PR automatically receives a review comment from Anthropic's official `claude-code-action` (configured in `.github/workflows/claude-review.yml`). It checks PRs against the rules in this file and the format spec in `CLAUDE_CODE_BRIEF.md`.

Treat its feedback as a useful second opinion, not as ground truth:

- If it flags something legitimate, fix it in a new commit on the same branch.
- If you disagree, push back in a PR comment with reasoning. Don't suppress the bot.
- Bot review never replaces human review — branch protection still requires a human approval before merge.
- Don't game the bot by writing prompts to make it pass. The CLAUDE.md rules are the real standard.

### 4. Conventional Commits

Every commit message follows the [Conventional Commits 1.0.0](https://www.conventionalcommits.org/) spec:

```
<type>(<scope>): <description>

[optional body]

[optional footer]
```

**Types** we use:
- `feat` — new feature
- `fix` — bug fix
- `test` — adding or modifying tests
- `refactor` — code change that neither fixes a bug nor adds a feature
- `docs` — documentation only
- `chore` — build, tooling, dependencies
- `style` — formatting, whitespace (no code change)
- `perf` — performance improvement
- `ci` — CI/CD configuration

**Scopes** (use when meaningful):
- `parser` — UDF XML parsing logic
- `render` — HTML rendering layer
- `ui` — frontend UI / interactions
- `tauri` — Rust backend / Tauri config
- `ci` — GitHub Actions
- `deps` — dependency updates

**Description rules**:
- Imperative mood: "add table support", not "added" or "adds"
- Lowercase first letter (after the type/scope)
- No period at the end
- Under 72 characters

**Examples**:
```
feat(parser): resolve named styles via resolver chain
fix(parser): handle negative Java int colors correctly
test(parser): add fixture for table-with-colspan
refactor(render): extract paragraph style computation
chore(deps): bump jszip to 3.10.1
docs: add screenshot to README
```

**When to use body**: Explain *why*, not *what* (the diff shows what). Wrap at 72 chars. Reference issues/PRs in the footer: `Closes #12`.

**One concern per commit.** If your commit message needs an "and" or two types, split into two commits. `feat: add parser and update README` → bad. `feat(parser): add table parsing` + `docs: document table support` → good.

### 5. TDD + branch + PR workflow in practice

Concrete example for a new feature:

```bash
# 1. Branch off latest main
git checkout main && git pull
git checkout -b feat/parser-table-rendering

# 2. Red: write a failing test
vim test/parser.test.mjs   # add test for table parsing
npm test                    # confirm it FAILS for the right reason
git add test/
git commit -m "test(parser): add failing test for table element parsing"

# 3. Green: minimum code to pass
vim src/parser.js           # implement table parsing
npm test                    # confirm GREEN
git add src/
git commit -m "feat(parser): parse <table> elements into row/cell tree"

# 4. Refactor if needed (optional commit)
vim src/parser.js           # extract helper, rename, etc.
npm test                    # still green
git add src/
git commit -m "refactor(parser): extract cell-paragraph collection into helper"

# 5. Push and open PR
git push -u origin feat/parser-table-rendering
gh pr create --title "feat(parser): table element parsing" --body "..."

# 6. After merge
git checkout main && git pull
git branch -d feat/parser-table-rendering
git push origin --delete feat/parser-table-rendering
```

## Code style

- **JavaScript**: ES modules. Async/await over `.then()`. Named exports preferred. No semicolon-less style — use semicolons.
- **No frameworks.** Vanilla HTML/CSS/JS. If you feel the urge to add React/Vue/lodash/etc, stop and ask first.
- **Inline styles in HTML are okay for the UI mockup phase**, but real CSS lives in `src/styles.css`.
- **No emoji** in the UI or commit messages. Professional tone.
- **Comments**: explain *why*, not *what*. The code shows what.
- **File length**: keep modules under 300 lines. Split if growing past.
- **Function length**: prefer under 40 lines. Extract helpers.
- **Naming**: descriptive over short. `resolveStyleChain` not `rsc`.

## Stage discipline

The brief in `CLAUDE_CODE_BRIEF.md` defines four stages. Do not skip ahead.

- **Do exactly what the current stage asks.** Do not anticipate Stage N+1 by adding hooks for it now.
- **Stop at the end of each stage** and wait for human review before moving to the next.
- If you think a stage is incomplete or wrong, raise the concern. Do not silently expand scope.

## Things to never do

- Never commit to `main` directly.
- Never write production code before its test.
- Never `git push --force` to `main`. Only force-push to your own feature branches, and only when necessary.
- Never include emoji in commit messages, code comments, or UI text.
- Never add a framework (React, Vue, Svelte, lodash, etc.) without explicit human approval.
- Never modify files in `samples/fixtures/` — those are committed test fixtures.
- Never commit anything from `samples/private/` — that directory is gitignored and contains real UDFs with personal data. If you find yourself touching anything in `samples/private/`, stop and ask.
- Never invent UDF format details. If unsure, inspect the real samples or ask.
- Never claim a task is done without running tests and seeing green.
- Never bypass tests with `.skip`, `.only`, or `if (false)` in committed code.

## Quick reference — commands

```bash
# Dev
npm run tauri dev          # run app in dev mode
npm test                   # run all tests
npm run test:parser        # parser tests only

# Build
npm run tauri build        # production build for current platform

# Git
git checkout -b <branch>   # always start from main pulled fresh
gh pr create               # open PR via GitHub CLI
gh pr view --web           # open PR in browser
gh pr merge --squash       # squash-merge (after approval)
```

## When something is unclear

Ask. Do not guess. The brief and this file are the source of truth; if they disagree or don't cover something, surface the question rather than picking a direction silently.
