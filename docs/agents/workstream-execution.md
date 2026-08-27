# Workstream execution

Use this runbook for concurrent issue implementation in the BracketIQ monorepo. A worker owns one prepared Workstream branch. A Workstream may contain a parallel batch of related issues. This runbook defines issue selection, worktree isolation, integration, and test database isolation.

## Terms and ownership

- A **Workstream** is an ownership lease and an integration lane. It can carry multiple related issues in parallel.
- A **worker** owns one Workstream at a time.
- A worker may work on multiple issues in one Workstream when the coordinator approves the batch and native blockers are clear.
- A **coordinator** owns the clean `main` worktree.
- The coordinator creates isolated worktrees.
- The coordinator integrates completed Workstream branches.
- A worker can reuse one isolated worktree.
- A Workstream batch uses one fresh branch. Keep commits and close comments traceable to their issue.
- A worker uses a fresh test database for each database-backed issue.

The same Workstream branch may carry multiple issue slices. The coordinator sequences issues that change the same API, Prisma, Room, or fixture contract. A native issue blocker represents a real implementation prerequisite. The Workstream limit controls likely merge overlap.

## Ready issue gate

An issue is ready when all these conditions are true:

- The issue is open.
- The issue has the `ready-for-agent` label.
- The issue has no open native blocker.
- The issue has no assignee.
- The project Status is `Todo`.
- The issue has one Workstream value.
- The issue has no sub-issues.

Treat every issue with sub-issues as a tracking issue.

Select the first ready issue in project order. The coordinator may add other ready issues in the same Workstream to a parallel batch when their native blockers are clear and their contracts can share one branch.

Claim each selected issue with `gh issue edit <number> --add-assignee @me` before implementing that issue.

Set each selected issue's project Status to `In progress`.

Return an issue with a missing decision to triage. Apply `needs-info` or `needs-triage` as specified in `triage-labels.md`.

## Issue lifecycle

1. The coordinator assigns one Workstream to one worker and declares the issue batch.
2. The worker claims the first ready issue in that Workstream. The worker claims each additional approved issue before implementing it.
3. The coordinator prepares an isolated worktree from the current clean `main` branch.
4. The coordinator creates the Workstream branch in the isolated worktree.
   - Create the branch from the current `main`.
   - Name the branch `workstream/<short-name>`.
   - Use an existing repository branch convention when one exists.
   - Keep every issue in the approved batch on this branch.

   Git worktree tooling can complete steps 3 and 4 in one command.

5. The worker implements each issue in the batch.
   - Read the complete issue body.
   - Read all issue comments.
   - Use the issue body and comments as the requirement boundary.
   - Read a parent or blocker issue only when an acceptance criterion leaves a required decision or contract unresolved.
   - Read a historical plan only when the active issue or plan names it.
   - Record every changed API, Prisma, Room, or fixture contract before another issue consumes it.
   - Run focused type checks during implementation.
   - Run focused tests during implementation.
   - Keep commits and changed files traceable to the issue that owns them.
   - For site JavaScript or TypeScript changes, run `npm run lint:changed` from `apps/site` before each commit.
6. **Workstream synchronization**
   1. The coordinator confirms that `main` is clean.
   2. The coordinator confirms that `main` is current.
   3. The worker merges the current local `main` into the Workstream branch before the final issue gate.
7. The worker resolves every merge conflict inside the isolated worktree.
   - Use `/resolving-merge-conflicts`.
   - Commit the merge resolution on the Workstream branch.
8. The worker completes the final issue gate for every issue in the batch.
   - Rerun the affected type checks after conflict resolution.
   - Rerun the affected tests after conflict resolution.
   - Run each complete suite that covers a changed site or mobile contract once.
   - Run `/code-review` against the batch base and each issue specification.
   - Address every review finding before closing the affected issue.
   - Rerun each affected check after a review fix.
   - Commit the final changes.
   - Add a close comment when an issue's acceptance criteria are complete.
   - Include the outcome, verification, available commit reference, and changed-contract notes in each close comment.
   - Set the completed issue's project Status to `Done`.
   - Close the completed issue.
   - Defer a close comment, Status change, or closure only when an acceptance criterion requires integration.
9. The coordinator integrates the Workstream branch with `git merge --ff-only <workstream-branch>`.
   - Return the branch to step 6 when `main` moved.
   - Run the integrated checks.
   - Complete deferred close actions after every integration acceptance criterion passes.
10. The worker starts the next batch from the new `main`.
    - Wait until the prior Workstream branch is integrated.
    - Return to the ready issue gate.
    - Reuse the isolated worktree only after the prior Workstream is inactive.

The coordinator keeps Workstream conflict resolution off `main`. A successful fast-forward proves that the worker resolved conflicts against the integration state.

## Test database isolation

Before preparing test storage, read [Workstream test database isolation](workstream-database-isolation.md) when an issue needs Prisma-backed tests, E2E seeding, backend-calling mobile tests, or Room persistence tests.

