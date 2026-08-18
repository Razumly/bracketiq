# Workstream execution

Use this runbook for concurrent issue implementation in the BracketIQ monorepo. A worker owns one prepared issue branch. This runbook defines issue selection, worktree isolation, integration, and test database isolation.

## Terms and ownership

- A **Workstream** is an ownership lease and an integration lane. It is not a long-lived branch.
- A **worker** owns one Workstream at a time.
- A worker has at most one issue in progress.
- A **coordinator** owns the clean `main` worktree.
- The coordinator creates isolated worktrees.
- The coordinator integrates completed issue branches.
- A worker can reuse one isolated worktree.
- A worker uses a fresh branch for each issue.
- A worker uses a fresh test database for each database-backed issue.

The coordinator sequences issues that change the same API, Prisma, Room, or fixture contract. A native issue blocker represents a real implementation prerequisite. The Workstream limit controls likely merge overlap.

## Ready issue gate

An issue is ready when all these conditions are true:

- The issue is open.
- The issue has the `ready-for-agent` label.
- The issue has no open native blocker.
- The issue has no assignee.
- The project Status is `Todo`.
- The issue has one Workstream value.
- No other issue in that Workstream has Status `In progress`.
- The issue has no sub-issues.

Treat every issue with sub-issues as a tracking issue.

Select the first ready issue in project order.

Claim it with `gh issue edit <number> --add-assignee @me` before any implementation work.

Set its project Status to `In progress`.

Return an issue with a missing decision to triage. Apply `needs-info` or `needs-triage` as specified in `triage-labels.md`.

## Issue lifecycle

1. The coordinator assigns one Workstream to one worker.
2. The worker claims the first ready issue in that Workstream.
3. The coordinator prepares an isolated worktree from the current clean `main` branch.
4. The coordinator creates the issue branch in the isolated worktree.
   - Create the branch from the current `main`.
   - Name the branch `issue/<number>-<short-name>`.
   - Use an existing repository branch convention when one exists.

   Git worktree tooling can complete steps 3 and 4 in one command.

5. The worker implements the complete issue.
   - Read the complete issue body.
   - Read all issue comments.
   - Record every changed API, Prisma, Room, or fixture contract before another issue consumes it.
   - Run focused type checks during implementation.
   - Run focused tests during implementation.
   - Commit the implementation.
6. **Issue-branch synchronization**
   1. The coordinator confirms that `main` is clean.
   2. The coordinator confirms that `main` is current.
   3. The worker merges the current local `main` branch into the issue branch.
7. The worker resolves every merge conflict inside the isolated worktree.
   - Use `/resolving-merge-conflicts`.
   - Commit the merge resolution on the issue branch.
8. The worker completes the final issue gate.
   - Rerun the affected type checks after conflict resolution.
   - Rerun the affected tests after conflict resolution.
   - Run each complete suite that covers a changed site or mobile contract once.
   - Run `/code-review` against the pre-issue base.
   - Address every review finding.
   - Rerun each affected check after a review fix.
   - Commit the final changes.
   - Add the close comment when the acceptance criteria are complete.
   - Include the outcome, verification, available commit reference, and changed-contract notes in the close comment.
   - Set the project Status to `Done`.
   - Close the issue.
   - Defer the close comment, Status change, and closure only when an acceptance criterion requires integration.
9. The coordinator integrates the issue branch with `git merge --ff-only <issue-branch>`.
   - Return the branch to step 6 when `main` moved.
   - Run the integrated checks.
   - Complete the deferred close actions after every integration acceptance criterion passes.
10. The worker starts the next issue from the new `main`.
    - Wait until the prior branch is integrated.
    - Return to the ready issue gate.
    - Reuse the isolated worktree only after the prior branch is inactive.

The coordinator keeps issue-branch conflict resolution off `main`. A successful fast-forward proves that the worker resolved conflicts against the integration state.

## Test database isolation

Before preparing test storage, read [Workstream test database isolation](workstream-database-isolation.md) when an issue needs Prisma-backed tests, E2E seeding, backend-calling mobile tests, or Room persistence tests.
