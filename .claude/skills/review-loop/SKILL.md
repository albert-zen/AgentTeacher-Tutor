---
name: review-loop
description: Implement a feature with automated review cycles. Writes code, runs all quality gates, then performs self-review. Iterates until clean. Use when implementing features that need careful quality control.
---

Implement the requested feature using a strict write-review loop.

## Phase 1: Implement

1. Read `CLAUDE.md` to understand project conventions
2. Create a feature branch: `git checkout -b feature/<name>`
3. Implement the feature following TDD (write tests first when applicable)
4. Make small, logical commits as you go

## Phase 2: Gates

Run ALL quality gates. Every one must pass before review:

```bash
npm test
node ./node_modules/typescript/bin/tsc --noEmit -p packages/server/tsconfig.json
node ./node_modules/typescript/bin/tsc --noEmit -p packages/client/tsconfig.json
npm run lint
```

If any gate fails, fix and re-run ALL gates from the start.

## Phase 3: Review

Once all gates pass, launch a **code-reviewer subagent** (Task tool with `subagent_type="code-reviewer"`) to review changes:

> Review the changes on the current feature branch.
>
> Instructions:
> 1. Read `CLAUDE.md` to understand project conventions
> 2. Run `git diff main --stat` and `git diff main` to see all changes
> 3. Review each changed file for **functionality** (logic errors, unhandled edge cases), **readability** (clear names, no unnecessary complexity), **project conventions** (strict TS, full-stack type safety, error handling, test coverage), **style** (consistent patterns, no over-engineering, no debug leftovers)
> 4. If issues found: fix, commit, re-run ALL quality gates. Maximum 2 fix rounds.
> 5. Report back: review verdict (PASS / FAIL with remaining issues), fix rounds used

**Fallback**: If you are a subagent (cannot spawn sub-subagents), perform self-review instead:

1. Run `git diff main --stat` and `git diff main`
2. Check each changed file against the same criteria above
3. If issues found: fix, commit, go back to Phase 2

## Phase 4: Report

Present a summary: what was implemented, files changed, self-review result, fix rounds needed.

## Rules

- Maximum 2 fix rounds after review. If still not clean, report remaining issues to user.
- Never skip gates.
- Use `node ./node_modules/typescript/bin/tsc` (not `npx tsc`) on Windows.
