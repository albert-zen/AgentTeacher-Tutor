---
name: parallel-work
description: Orchestrate parallel feature development using git worktrees and subagents. Creates isolated worktrees, spawns worker subagents for each job, runs review loops, then presents results for user approval before merging.
---

Orchestrate parallel development of multiple independent tasks. You are the orchestrator.

## Input

The user provides: $ARGUMENTS
This should describe the tasks to parallelize, or reference a plan that's already been discussed.

## Phase 1: Plan & Validate

1. Read `CLAUDE.md` for project conventions
2. Identify the independent tasks from the user's input
3. For each task, define:
   - Branch name: `feature/<task-name>`
   - Worktree directory: `../<project>-<task-name>`
   - Clear scope: what files to create/modify, what the task delivers
4. Present the plan to the user and **ask for confirmation** before proceeding

## Phase 2: Setup Worktrees

For each task, create a worktree:

```bash
git worktree add ../<project>-<task-name> -b feature/<task-name>
```

Then install dependencies in each worktree:

```bash
cd ../<project>-<task-name> && npm install
```

## Phase 3: Spawn Worker Subagents

Launch subagents **in parallel** (multiple Task tool calls in one message). Each worker gets this prompt:

> You are working in the directory: `../<project>-<task-name>`
>
> Your task: [specific task description]
>
> Instructions:
> 1. `cd` to your worktree directory for all operations
> 2. Read `CLAUDE.md` to understand conventions
> 3. Implement the feature following TDD
> 4. Run all quality gates:
>    - `npm test`
>    - `node ./node_modules/typescript/bin/tsc --noEmit -p packages/server/tsconfig.json`
>    - `node ./node_modules/typescript/bin/tsc --noEmit -p packages/client/tsconfig.json`
>    - `npm run lint`
> 5. Fix any failures and re-run gates
> 6. Make small, logical commits on your feature branch
> 7. Once all gates pass, self-review: run `git diff main`, check each changed file for correctness, consistency, safety, and completeness. Fix any issues found (max 2 fix rounds), re-run gates after fixes.
> 8. Report back: what you implemented, files changed, self-review result (PASS/issues found + fixed)

## Phase 4: Collect & Verify

After all workers complete:

1. Read each worker's report
2. Check for any failures or unresolved issues
3. If any worker failed, report which tasks succeeded and which need attention

## Phase 5: Orchestrator Review

For each task, the orchestrator spawns a **code-reviewer subagent** (Task tool with `subagent_type="code-reviewer"`) to independently review the worktree. Reviewers can be launched **in parallel** (up to 4).

Each reviewer gets this prompt:

> Review the changes on branch `feature/<task-name>` in worktree `../<project>-<task-name>`.
>
> Instructions:
> 1. `cd` to the worktree directory
> 2. Read `CLAUDE.md` to understand project conventions
> 3. Run ALL quality gates:
>    - `npm test`
>    - `node ./node_modules/typescript/bin/tsc --noEmit -p packages/server/tsconfig.json`
>    - `node ./node_modules/typescript/bin/tsc --noEmit -p packages/client/tsconfig.json`
>    - `npm run lint`
> 4. Run `git diff main --stat` and `git diff main` to see all changes
> 5. Review each changed file for **functionality** (logic errors, unhandled edge cases), **readability** (clear names, no unnecessary complexity), **project conventions** (strict TS, full-stack type safety, error handling, test coverage), **style** (consistent patterns, no over-engineering, no debug leftovers)
> 6. If issues found: fix, commit, re-run ALL gates. Maximum 2 fix rounds.
> 7. Report back: gate results, review verdict (PASS / FAIL with remaining issues), fix rounds used

If a reviewer reports FAIL after 2 rounds, mark the task as "needs attention" with remaining issues listed.

Only tasks that pass reviewer review proceed to the next phase.

## Phase 6: Present to User

Present a summary:

```
## Parallel Work Complete

### Task A: [name] — [status]
Branch: feature/<name>
Files changed: [list]
Review: Approved (round X/3)

### Task B: [name] — [status]
...

### Next Steps
Ready to merge: [list approved branches]
Needs attention: [list any issues]
```

**Ask the user to review before merging.** Do NOT merge automatically.

## Phase 7: Merge (on user approval)

For each approved branch:

```bash
git checkout main
git merge feature/<task-name>
git worktree remove ../<project>-<task-name>
```

## Rules

- Never merge without user approval
- Maximum 4 parallel tasks (more causes rate limit issues)
- Each worker subagent must self-review (sub-agents CANNOT spawn sub-agents)
- Quality gate commands must use `node ./node_modules/typescript/bin/tsc` (not `npx tsc`) to avoid path issues on Windows
- If a worker hits problems, let it report back — don't block other workers
- Clean up worktrees after successful merge
