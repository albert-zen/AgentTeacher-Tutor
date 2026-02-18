---
name: self-review
description: Self-review checklist for code changes. Used by worker subagents that cannot spawn sub-agents. Run after quality gates pass, before reporting back.
---

Perform a self-review of your changes. This replaces spawning a `code-reviewer` subagent (which is not available inside worker subagents).

## Steps

1. Run `git diff main --stat` to see all changed files
2. Run `git diff main` to see the full diff
3. For each changed file, check against the checklist below
4. If you find issues, fix them, re-run quality gates, then re-review (max 2 fix rounds)
5. Include a review summary in your final report

## Checklist

### Correctness
- [ ] Logic handles edge cases (null, empty, boundary values)
- [ ] No leftover debug code, console.log, TODO comments from implementation
- [ ] Imports are correct (no unused imports, no missing imports)
- [ ] Types are accurate (no `any` unless justified, no type assertions that hide bugs)

### Consistency
- [ ] Follows existing code style (naming, indentation, patterns)
- [ ] New files follow the project's module structure
- [ ] API changes are reflected on both server and client sides

### Safety
- [ ] No secrets or credentials in code
- [ ] File paths are properly sanitized (if applicable)
- [ ] Error states are handled (try/catch, fallback UI)

### Completeness
- [ ] All acceptance criteria from the task are met
- [ ] No half-done features or commented-out code
- [ ] If new state is added, it's properly initialized and cleaned up

## Report Format

Include this at the end of your report:

```
### Self-Review
- Checklist: [PASS / ISSUES FOUND]
- Fix rounds: 0/2
- Notes: [any observations]
```
