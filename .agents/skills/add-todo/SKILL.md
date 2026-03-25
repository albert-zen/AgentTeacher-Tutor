---
name: add-todo
description: Add a structured requirement to TODO.md. Analyzes the codebase to write accurate 现状/目标/工程要点 sections, places it in the correct tier, and updates the dependency graph.
---

Add a new requirement to `TODO.md` following the project's established format. You are a product analyst who understands the codebase.

## Input

The user provides: $ARGUMENTS
This can be a brief idea ("add dark mode"), a detailed spec, or something in between. Your job is to fill in the gaps by reading the code.

## Phase 1: Understand Context

1. Read `AGENTS.md` for project architecture and conventions
2. Read `TODO.md` to understand:
   - The existing tier structure (Tier 1–5) and what belongs where
   - Which items already exist (avoid duplicates)
   - The dependency graph at the bottom
3. Read relevant source files to accurately describe the **现状** (current state)
   - If the user's idea touches the UI, read the relevant components
   - If it touches the server, read the relevant routes/services
   - Be specific: mention actual class names, file paths, current behavior

## Phase 2: Draft the Requirement

Write the requirement in this exact format:

```markdown
### <Title in Chinese>

**现状：** <Accurate description of current behavior, referencing actual code/files>

**目标：** <Clear description of the desired end state>

**工程要点：**
- <Specific implementation point with file paths and approach>
- <Another point>
- ...
```

Guidelines for each section:
- **现状**: Must be factually accurate. Read the code first. Reference actual files, components, APIs.
- **目标**: Concrete and testable. Someone should be able to read this and know exactly when it's "done".
- **工程要点**: Actionable engineering notes. Mention specific files to change, patterns to follow, potential gotchas. These should be helpful to the developer implementing the feature.

## Phase 3: Place It

Decide which tier this belongs in:
- **Tier 1** (体验基础): Core UX improvements that directly affect daily usage
- **Tier 2** (上下文编排): Context orchestration features — the project's core differentiator
- **Tier 3** (Agent 能力扩展): Expanding what the Teacher Agent can do
- **Tier 4** (交互进阶): Advanced interaction patterns, high effort
- **Tier 5** (平台化): Platform/deployment concerns

If the requirement clearly fits an existing tier, insert it there. If it doesn't fit any tier, suggest creating a new one or ask the user.

## Phase 4: Update Dependencies

Check if the new requirement:
- **Blocks** or **is blocked by** any existing item
- Should be added to the dependency graph at the bottom of TODO.md

Update the `## 依赖关系` section if there are dependencies.

## Phase 5: Present to User

Show the user the drafted requirement and where it will be placed. **Ask for confirmation before writing to TODO.md.**

Include:
- The full formatted requirement
- Which tier / where it goes
- Any dependency relationships identified
- Questions about anything unclear from the user's brief

## Rules

- Always read the relevant source code before writing 现状 — never guess
- Write in Chinese to match the existing TODO.md style
- Keep 工程要点 practical and specific, not generic advice
- If the user's idea overlaps with an existing TODO item, point it out and ask whether to merge, extend, or create a separate entry
- One requirement per invocation — if the user gives multiple ideas, handle them one at a time
- Never remove or modify existing TODO items unless the user explicitly asks
