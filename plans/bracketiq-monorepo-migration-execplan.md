# Consolidate BracketIQ web, backend, and mobile code into one monorepo

This ExecPlan is a living document. Keep `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` current while executing it. Maintain it in accordance with `PLANS.md` at the `mvp-site` repository root. After the repository move, the same file remains at `plans/bracketiq-monorepo-migration-execplan.md` in the monorepo and the root `PLANS.md` remains authoritative.

## Purpose / Big Picture

Consolidate `Razumly/mvp-site` and `Razumly/mvp-app` into one GitHub repository named `Razumly/bracketiq`. A developer must be able to clone one repository, inspect the web application, backend, mobile application, shared product documentation, and issues, and submit one pull request for a change that spans the backend and mobile client.

The site and mobile application keep separate build tools and release processes. The site remains a Next.js and Prisma application. The mobile application remains a Kotlin Multiplatform, Android, iOS, Wear OS, and watchOS application. A monorepo is one source-control repository. It is not one runtime or one release. The backend HTTP interface remains the seam between the two applications. Backend changes must remain compatible with installed mobile versions.

The migration must not change product behavior, database data, public URLs, or production runtime state. A fresh monorepo clone must pass the existing site and mobile checks. The GitHub Project named `BracketIQ` must receive issues from the new repository through its one GitHub Free auto-add workflow.

## Progress

- [x] (2026-08-17T18:21:56Z) Inspected both repositories, their GitHub ownership, default branches, worktree state, build tools, CI workflows, deployment paths, issue-tracker rules, local backend discovery, and duplicated contract version.
- [x] (2026-08-17T18:21:56Z) Selected `Razumly/mvp-site` as the target repository and selected `apps/site` plus `apps/mobile` as the target code layout.
- [x] (2026-08-17T18:21:56Z) Wrote this migration plan. No history, repository setting, issue, workflow, package, or runtime was changed.
- [ ] Reconcile and publish all intended local work in both source repositories. Do not discard the current ahead commits or uncommitted files.
- [ ] Inventory open pull requests, open issues, labels, rulesets, Actions variables, secret names, environments, releases, tags, packages, webhooks, and installed GitHub Apps.
- [ ] Create verified mirror backups and immutable pre-migration tags for both source repositories.
- [ ] Build the monorepo candidate on a migration branch in a fresh clone of `Razumly/mvp-site` and import the rewritten `mvp-app` history under `apps/mobile`.
- [ ] Move the current site implementation under `apps/site` while retaining shared plans, domain documents, agent rules, workflows, and repository metadata at the root.
- [ ] Update active paths, local launchers, tests, CI workflows, deployment files, package identity, and agent instructions for the new layout.
- [ ] Pass history checks, site checks, Android checks, iOS checks, Docker checks, and the local mobile-to-backend smoke test on the migration pull request.
- [ ] Merge the migration, rename `Razumly/mvp-site` to `Razumly/bracketiq`, update GitHub settings, and connect the `BracketIQ` Project to the renamed repository.
- [ ] Transfer any open `mvp-app` issues, preserve old pull-request and release history in the archived repository, and archive `Razumly/mvp-app` only after fresh-clone acceptance passes.

## Surprises & Discoveries

- Observation: Both repositories have already moved from the personal `camka14` account to the `Razumly` organization.
  Evidence: the GitHub API resolves the repositories as `Razumly/mvp-site` and `Razumly/mvp-app`, and both report Projects enabled. Local remotes and active repository instructions still contain `camka14` URLs.

- Observation: The `Razumly` organization uses GitHub Free.
  Evidence: `gh api orgs/Razumly --jq .plan.name` returned `free`. GitHub Free permits one built-in Project auto-add workflow. One monorepo allows that workflow to cover all new product issues.

- Observation: The default branches do not match.
  Evidence: `mvp-site` uses `main`. `mvp-app` uses `master`. The monorepo will use `main`.

- Observation: Neither active worktree is a safe migration source today.
  Evidence: on 2026-08-17, `mvp-site` was ten commits ahead of `origin/main` with modified scheduler and repository files plus an untracked migration. `mvp-app` was twelve commits ahead of `origin/master` with 45 modified and six untracked paths. The migration must use fresh clones after this work is reconciled and pushed.

- Observation: The two local Git object stores are large enough to require verified backups and shallow CI checkouts.
  Evidence: local Git object storage was approximately 127 MiB for `mvp-app` and 679 MiB for `mvp-site`. The GitHub API reported smaller repository sizes because local stores include additional objects and refs. Do not use an active worktree for history rewriting.

- Observation: Mobile development already depends on the backend checkout location.
  Evidence: `mvp-app/scripts/ensure-local-backend.sh`, `mvp-app/dev.ps1`, and `MobileApiIntegrationSupport.kt` search sibling and machine-specific `mvp-site` paths. The monorepo gives these callers one stable default at `apps/site`.

- Observation: Moving the complete mobile tree under `apps/mobile` preserves its internal iOS and Gradle relative paths.
  Evidence: `iosApp/Podfile` points to `../composeApp`; `composeApp/composeApp.podspec` invokes `../gradlew`; Xcode scripts use paths relative to `iosApp` and the mobile root. These relationships remain unchanged when the complete tree moves together.

- Observation: The backend and mobile client copy at least one contract version by hand.
  Evidence: `mvp-site/src/contracts/eventEditor.ts` and `mvp-app/core/network/src/commonMain/kotlin/com/razumly/mvp/core/network/dto/EventEditorDtos.kt` both define event editor contract version 3. The repository move must not silently replace the HTTP interface with shared runtime source.

- Observation: Current production-image configuration still uses the former personal namespace.
  Evidence: `.github/workflows/publish-vm-image.yml`, `deploy/vm/bin/deploy.sh`, `deploy/vm/bin/verify-ci.sh`, and deployment examples refer to `ghcr.io/camka14/mvp-site` or `camka14/mvp-site`. Historical plans also contain those names and must remain historical evidence.

- Observation: `git-filter-repo` is not installed on the current Mac.
  Evidence: `which git-filter-repo` returned no path. The migration will install version 2.47.0 in a disposable Python virtual environment and run it only against a fresh mirror clone.

## Decision Log

- Decision: Use `Razumly/mvp-site` as the target repository, then rename it to `Razumly/bracketiq` after the migration pull request passes.
  Rationale: this repository owns the backend interface, production deployment settings, root product context, architecture decisions, and the larger active issue set. Keeping its repository identity preserves its issues, pull requests, secrets, environments, installed integrations, and repository-level history. A rename preserves the repository identity and redirects the old URL.
  Date/Author: 2026-08-17 / Codex

- Decision: Place deployable code under `apps/site` and `apps/mobile`.
  Rationale: the names describe product roles instead of old repository names. Each application keeps its existing internal layout and build system. The shared root stays small and owns product-wide documents, issue rules, workflows, and plans.
  Date/Author: 2026-08-17 / Codex

- Decision: Keep `main` as the single default branch.
  Rationale: the target repository already uses `main`, the production verification scripts require `main`, and retaining it avoids a second branch-policy migration. The imported mobile `master` tip becomes history behind the monorepo merge commit.
  Date/Author: 2026-08-17 / Codex

- Decision: Preserve the `mvp-site` commit graph without rewriting it. Rewrite only `mvp-app` paths with `git-filter-repo==2.47.0`, then merge the filtered branch with full history.
  Rationale: the target repository keeps existing commit and pull-request references. Rewriting the mobile paths makes `git log`, blame, and future changes work under `apps/mobile`. The archived mobile repository preserves the original commit identifiers.
  Date/Author: 2026-08-17 / Codex

- Decision: Prefix imported mobile tags with `mobile-` and use `site-` and `mobile-` prefixes for future release tags.
  Rationale: both applications release independently. Prefixes prevent collisions and make a tag's release target explicit. The archived mobile repository remains the source for any old GitHub Release metadata that cannot move.
  Date/Author: 2026-08-17 / Codex

- Decision: Keep the backend and mobile build graphs separate.
  Rationale: npm, Prisma, Gradle, CocoaPods, and Xcode have different requirements. Co-location does not justify a new root package manager or a shallow shared module. Root orchestration may call each application, but it must not merge their dependency graphs.
  Date/Author: 2026-08-17 / Codex

- Decision: Keep `CONTEXT.md`, `docs/adr`, `docs/agents`, `plans`, `PLANS.md`, `.agents`, and `skills-lock.json` at the root.
  Rationale: they describe one BracketIQ product and one engineering workflow. Site-specific and mobile-specific implementation rules will live in nested `apps/site/AGENTS.md` and `apps/mobile/AGENTS.md` files.
  Date/Author: 2026-08-17 / Codex

- Decision: Do not generate a new OpenAPI client during this repository migration.
  Rationale: contract generation is a separate behavioral change. The migration must preserve current request and response behavior. A later issue can formalize a language-neutral contract after the repository move has a stable baseline.
  Date/Author: 2026-08-17 / Codex

- Decision: Use always-present CI gate jobs with path-aware heavy jobs.
  Rationale: GitHub required checks can remain pending when a complete workflow is skipped by a path filter. Each site and mobile workflow must always report one stable gate result. Heavy jobs run only when their application or a shared contract path changes.
  Date/Author: 2026-08-17 / Codex

- Decision: Do not deploy or stop production as part of the repository-structure cutover.
  Rationale: repository conversion does not require a production state change. Production image publication and deployment remain separately authorized operational actions. The migration must update and validate deployment artifacts without changing the live runtime.
  Date/Author: 2026-08-17 / Codex

- Decision: Archive `Razumly/mvp-app` instead of deleting it.
  Rationale: GitHub pull requests, closed issues, releases, discussions, and original commit identifiers cannot all be merged into another repository. Archival keeps that evidence read-only and gives users a clear link to the monorepo.
  Date/Author: 2026-08-17 / Codex

## Outcomes & Retrospective

This document is the only completed artifact. No repository history, issue, label, GitHub Project, workflow, package, deployment file, or runtime has changed. Update this section after each milestone. At completion, record the final source tags, source and target commit identifiers, imported commit count, CI run URLs, Project automation proof, fresh-clone checks, and any paths that required an exception.

## Context and Orientation

`Razumly/mvp-site` contains the Next.js web application and backend route handlers. Prisma schema and migrations live under `prisma`. Server routes live under `src/app/api`. Production container and operator files live under `Dockerfile` and `deploy/vm`. Site CI is `.github/workflows/ci.yml`. Production image publication is `.github/workflows/publish-vm-image.yml`.

`Razumly/mvp-app` contains the Kotlin Multiplatform mobile application. The shared application is under `composeApp`. Reusable Kotlin modules are under `core`. Android and iOS wrappers are under `composeApp`, `iosApp`, `wearApp`, and their platform source sets. Mobile CI is `.github/workflows/ci.yml`. The Gradle root is the current repository root and must become `apps/mobile` without changing its internal module paths.

The target repository is the same GitHub repository object as `Razumly/mvp-site`. During development it retains that name. After the migration branch passes and merges, rename it to `Razumly/bracketiq`. The target working tree has this shape:

    /
    ├── .agents/
    ├── .github/workflows/
    ├── apps/
    │   ├── site/
    │   │   ├── package.json
    │   │   ├── prisma/
    │   │   ├── src/
    │   │   ├── public/
    │   │   ├── deploy/
    │   │   └── AGENTS.md
    │   └── mobile/
    │       ├── settings.gradle.kts
    │       ├── gradlew
    │       ├── composeApp/
    │       ├── core/
    │       ├── iosApp/
    │       ├── wearApp/
    │       └── AGENTS.md
    ├── docs/
    │   ├── adr/
    │   └── agents/
    ├── plans/
    │   └── mobile/
    ├── AGENTS.md
    ├── CONTEXT.md
    ├── LICENSE
    ├── PLANS.md
    ├── README.md
    └── skills-lock.json

A history rewrite changes commit identifiers while it relocates paths. This plan rewrites only the disposable mobile mirror. It never rewrites either source repository. A cutover is the GitHub setting change that makes the monorepo the official development repository. A CI gate is a small final job with a stable name that reports success when its heavy jobs pass or are correctly skipped.

The current inspected local tips are `ff575d3240cd1fe494e34a73c1b314435e70a64f` for `mvp-site` and `3b3261c9c423def85641936793835086bdc88296` for `mvp-app`. Their inspected remote tips are `24225244360afe1233afe2b5926094aa5eb55a8b` for `origin/main` and `9e04061be4a269bc74287cdfcda62c36411faea9` for `origin/master`. These are evidence only. Do not use them as cutover tips. Record fresh tips after all intended current work is committed and pushed.

## Plan of Work

### Milestone 1: make the source repositories safe to migrate

Finish or preserve every current local change before history work starts. Do not reset, clean, stash and forget, or copy an active working tree. Commit intended work to named branches and push it. Move incomplete work to explicit remote branches. Merge or close every pull request that must be part of the monorepo default branch. Record any pull request that will remain only in the archived mobile repository.

Create a migration inventory with names and identifiers, not secret values. Record both default-branch tips, all tags, releases, open pull requests, open issues, labels, rulesets, Actions workflow names, Actions variable names, Actions secret names, environments, GHCR packages, webhooks, and installed GitHub Apps. Redact values and authorization headers. Recheck the `BracketIQ` Project number and visibility after granting the local `gh` token the `project` scope if CLI access is needed.

Create bare mirror backups outside both working trees. Run `git fsck --full` on each mirror. Record a SHA-256 checksum of each backup archive. Create and push annotated tags named `pre-monorepo-site-$CUTOVER_DATE` on `mvp-site/main` and `pre-monorepo-mobile-$CUTOVER_DATE` on `mvp-app/master`. The date uses `YYYYMMDD`. Stop merging into either source default branch after these tags until the monorepo merge completes or the cutover is cancelled.

This milestone passes when both source default branches are clean and published, every intended change is reachable from a remote ref, both mirror backups pass `git fsck`, and the two pre-migration tags resolve to the recorded source tips.

### Milestone 2: build a history-preserving candidate

Use a fresh temporary directory. Clone `Razumly/mvp-site` as the candidate. Create `migration/bracketiq-monorepo` from the tagged site tip. Create a Python virtual environment in the temporary directory and install `git-filter-repo==2.47.0` into that environment. Clone `Razumly/mvp-app` with `--mirror`. Run filter-repo only inside that disposable mirror with `--to-subdirectory-filter apps/mobile` and `--tag-rename '':'mobile-'`.

Fetch the filtered mobile `master` branch and prefixed tags into the candidate. Merge the filtered branch with `--allow-unrelated-histories` and a non-fast-forward merge commit. Do not squash. Compare the mobile default-branch commit count before and after filtering. Inspect the filter-repo commit map and retain it in the migration evidence outside Git. The archived mobile repository remains the durable original-identifier map.

Create `apps/site` and move the active site implementation there with `git mv`. Move site code, build files, runtime files, and site-only development files. The observed root entries that belong under `apps/site` are `src`, `prisma`, `public`, `scripts`, `deploy`, `e2e`, `test`, `training`, `data`, `artifacts`, `output`, `test-results`, `package.json`, `package-lock.json`, `Dockerfile`, `docker-compose.yml`, `.dockerignore`, `.env.docker`, `.gitpod.yml`, `.nvmrc`, `.vscode`, `CODING_STANDARDS.md`, `components.json`, `codealike.json`, `instrumentation-client.ts`, `jest.config.ts`, `mdx-components.tsx`, `next.config.mjs`, `next.config.test.ts`, `playwright.config.ts`, `postcss.config.mjs`, `prettier.config.js`, `prisma.config.ts`, `server.mjs`, `tsconfig.json`, `tsconfig.jest.json`, and `eslint.config.mjs`. Move `README.md` to `apps/site/README.md` before creating the root README. Move the root `admin-constants-tab-execplan.md` into `plans/site/`.

Keep `.agents`, `.github`, `AGENTS.md`, `CONTEXT.md`, `docs`, `LICENSE`, `plans`, `PLANS.md`, and `skills-lock.json` at the root. Replace the old root `.gitignore` with a small root ignore file. Keep application-specific ignore rules under `apps/site/.gitignore` and `apps/mobile/.gitignore`.

Move imported historical mobile plans from `apps/mobile/plans` to `plans/mobile`. Remove the imported duplicate `apps/mobile/PLANS.md` after the root standard includes the monorepo plan path rule. Remove `apps/mobile/docs/agents` after merging any unique current rule into root `docs/agents`. Preserve all other imported mobile artifacts, screenshots, crash evidence, and configuration as-is during this migration. Cleanup of unusual tracked files is out of scope.

This milestone passes when one candidate commit contains both histories, no nested `.git` directory exists, `git log --follow -- apps/site/package.json` reaches site commits before the move, `git log -- apps/mobile/settings.gradle.kts` reaches the rewritten mobile history, and imported mobile tags start with `mobile-`.

### Milestone 3: establish one repository interface

Replace the root `README.md` with a short monorepo orientation. It must show exact commands for site install and development from `apps/site`, Android and iOS work from `apps/mobile`, and the local backend relationship. Do not add a root npm workspace. Do not move the Gradle root above `apps/mobile`.

Move the existing site-focused `AGENTS.md` content to `apps/site/AGENTS.md`. Keep the mobile rules in `apps/mobile/AGENTS.md`. Write a concise root `AGENTS.md` for shared product rules. It must declare `apps/site` as the backend and database source of truth, Room as the mobile local source of truth, the need for batch and atomic server operations, ASD-STE100 writing rules, the root ExecPlan rule, and the root agent-skill documents. Remove machine-specific source-repository paths and the old `camka14` remote rules from active instructions.

Keep the existing product `CONTEXT.md` and `docs/adr` at the root. Update active paths in `CONTEXT.md` when they refer to current implementation files. Do not mass-rewrite completed ExecPlans, audit evidence, or historical deployment transcripts. Those documents describe the paths and repository names that existed when the evidence was recorded. Add one short note to the root README that pre-migration documents can use `mvp-site` and `mvp-app` paths.

Update `docs/agents/issue-tracker.md` so `Razumly/bracketiq` is the canonical issue repository. Keep the five default labels in `docs/agents/triage-labels.md`. Keep a single-context product domain layout in `docs/agents/domain.md`; deployable application folders are not separate product domains.

Update `apps/mobile/scripts/ensure-local-backend.sh`, the root or mobile `dev.ps1`, and `MobileApiIntegrationSupport.kt` so the default backend path is the monorepo `apps/site` directory. Keep `MVP_SITE_DIR` only as an explicit override for a non-default checkout. Remove the old sibling-repository and machine-specific fallback paths. If `dev.ps1` remains inside `apps/mobile`, its default backend is `../site`. If it moves to the root, define explicit `apps/site` and `apps/mobile` paths and update every command that previously treated the script directory as the mobile root.

Do not change internal mobile relative paths that already remain valid. `iosApp/Podfile`, `composeApp/composeApp.podspec`, Gradle module includes, Xcode scripts, and CocoaPods framework search paths should continue to resolve inside `apps/mobile`. Change one only when a fresh-clone build proves it is broken.

Rename the site npm package from `starter-for-nextjs` to `bracketiq-site` and update the lockfile through npm. Do not rename Kotlin packages, bundle identifiers, application identifiers, database names, HTTP paths, or public domains.

This milestone passes when a developer can follow only the root README to install both applications, the mobile backend bootstrap finds `apps/site` without an override, and active configuration contains no `camka14/mvp-site`, `camka14/mvp-app`, sibling `../mvp-site`, or machine-specific source-repository path. Historical documents are exempt.

### Milestone 4: combine CI while preserving independent releases

Create root workflows named `site-ci.yml`, `mobile-ci.yml`, and `publish-site-image.yml`. The site and mobile CI workflows must run on pull requests and pushes to `main`. Each workflow must always produce a stable final gate job. A first job computes changed paths from the pull-request base or push predecessor. Site-heavy jobs run for `apps/site/**` and future shared contract paths. Mobile-heavy jobs run for `apps/mobile/**` and future shared contract paths. A root workflow change runs the affected workflow. Documentation-only changes may skip heavy jobs but must still pass both gates.

Run site commands with `apps/site` as the working directory. Point npm cache metadata at `apps/site/package-lock.json`. Preserve Prisma validation, route-inclusive tests and coverage, and TypeScript checks. Add the existing production build or Docker build only where its cost is acceptable and deterministic.

Run mobile commands with `apps/mobile` as the working directory. Keep JDK 17, Android SDK installation, Android unit tests, and macOS iOS simulator tests. Point Gradle cache discovery at `apps/mobile`. Preserve the release endpoint contract scripts under `apps/mobile/scripts/tests`.

Update the production image workflow to use Docker context `apps/site` and Dockerfile `apps/site/Dockerfile`. Update the CI verification script path to `apps/site/deploy/vm/bin/verify-ci.sh`. Change active repository fallbacks to `Razumly/bracketiq`. Select `ghcr.io/razumly/bracketiq-site:<full-commit-sha>` as the new image name. Update current deployment scripts and examples to accept that exact immutable image name. Do not rewrite old plan evidence that records already-deployed `ghcr.io/camka14/mvp-site` images.

Do not run the production publish workflow or change the VM during this plan unless the user gives separate, current authorization for that operational action. Prove the new Docker context with a local image build. Record any required GHCR package permission change in the migration issue before a later production release.

Update the target branch ruleset after CI runs once. Require the stable site and mobile gate jobs. Do not require conditional heavy-job names. Preserve the production environment and its reviewers.

The target repository retains existing site secrets, variables, environments, and installed integrations because its repository identity does not change. Recreate each mobile-only Actions variable and secret in the target from its approved external store. GitHub does not reveal existing secret values, so do not copy them through logs or command output. Give each workflow only the permissions it needs. Verify environment reviewers and branch restrictions after the new workflows exist.

This milestone passes when a site-only pull request runs the site-heavy jobs and both gates, a mobile-only pull request runs the mobile-heavy jobs and both gates, a shared-path test change runs both heavy groups, and the local production Docker image builds from `apps/site`.

### Milestone 5: validate before GitHub cutover

Open a pull request from `migration/bracketiq-monorepo` in `Razumly/mvp-site`. Do not rename the repository yet. Require all current source work to stay frozen while this pull request is under final review. Review the file moves with rename detection enabled. Verify that no ignored local secret, local database, build output, Pods output, `.env`, `local.properties`, or `secrets.properties` entered the branch.

Run the complete site and mobile commands in `Concrete Steps`. Start a local backend from `apps/site` with a non-production database. Confirm liveness and readiness. From `apps/mobile`, run one real mobile API integration test with `MVP_TEST_BACKEND_URL` and `MVP_TEST_ALLOW_DB_SEED=true`. The test must execute rather than skip. This proves that the mobile test can seed and call the backend from the monorepo.

Merge only after all gate jobs pass, the local smoke passes, the Docker image builds, and history checks pass. Record the merge commit as `MONOREPO_MERGE_SHA` in this plan.

### Milestone 6: perform the GitHub cutover

Rename `Razumly/mvp-site` to `Razumly/bracketiq` after the migration merge is on `main`. Confirm that the repository ID is unchanged and the old URL redirects. Update local clones to `https://github.com/Razumly/bracketiq.git`. Update repository description, topics, default clone instructions, rulesets, and any installed integration that stores a repository name instead of the repository ID.

Recheck `Razumly/mvp-app` for open issues and pull requests. Create all target labels before transferring an open issue. Transfer every open issue that belongs to future work into `Razumly/bracketiq`. Update each transferred issue with its `Area` value in the `BracketIQ` Project. Merge or close open mobile pull requests before archival; GitHub pull requests do not transfer with source history.

Link the renamed repository to the existing `BracketIQ` Project. Set it as the default repository. Configure the one built-in GitHub Free auto-add workflow for the renamed repository. Use a filter that adds new open issues and pull requests. Bulk-add existing open target items because auto-add does not backfill them. Add one single-select Project field named `Area` with `Shared`, `Backend`, `Web`, `Mobile`, and `Operations` values.

Before archiving the mobile repository, update its description and README to state that development moved to `https://github.com/Razumly/bracketiq/tree/main/apps/mobile`. Keep its original default branch, tags, releases, issues, pull requests, and history intact. Archive it only after the fresh-clone acceptance below passes. Do not delete it.

This milestone passes when the canonical clone URL is `Razumly/bracketiq`, a real migration issue appears in the `BracketIQ` Project through auto-add, existing open work is visible in the Project, old site URLs redirect, and the mobile repository is read-only with a clear destination link.

### Milestone 7: prove a fresh clone and close the migration

Clone `Razumly/bracketiq` into a new directory with no reused build cache or ignored local files. Provision local configuration through existing safe scripts. Run the same site, Android, and iOS checks again. Run the local backend and one mobile integration test again. Confirm that the root instructions alone are sufficient.

Record final CI run URLs, final repository and Project URLs, imported commit counts, tag prefixes, source snapshot tags, the monorepo merge SHA, and the fresh-clone command outputs in this plan. Remove temporary migration branches and local disposable mirrors only after their checksums and locations are recorded. Keep the offline source mirror backups through at least the first successful site release and first successful mobile release from the monorepo.

The repository conversion is complete when all acceptance conditions pass. A later, separately scoped plan may formalize an OpenAPI or JSON Schema contract and generated Kotlin models. Do not leave an empty `contracts` directory or placeholder generator in this migration.

## Concrete Steps

Run discovery commands from `/Users/elesesy/StudioProjects`. They are read-only except for the final tag commands, which run only after the source tips are approved.

    gh auth status
    gh repo view Razumly/mvp-site --json id,nameWithOwner,defaultBranchRef,visibility
    gh repo view Razumly/mvp-app --json id,nameWithOwner,defaultBranchRef,visibility
    gh pr list --repo Razumly/mvp-site --state open
    gh pr list --repo Razumly/mvp-app --state open
    gh issue list --repo Razumly/mvp-site --state open
    gh issue list --repo Razumly/mvp-app --state open
    gh label list --repo Razumly/mvp-site
    gh label list --repo Razumly/mvp-app
    gh secret list --repo Razumly/mvp-site
    gh secret list --repo Razumly/mvp-app
    gh variable list --repo Razumly/mvp-site
    gh variable list --repo Razumly/mvp-app
    git -C mvp-site status --short --branch
    git -C mvp-app status --short --branch

After all current work is committed and pushed, capture the approved tips and create backups. Set `CUTOVER_DATE` to the actual date.

Replace redirecting personal-account remotes with the organization URLs before the source freeze:

    git -C mvp-site remote set-url origin https://github.com/Razumly/mvp-site.git
    git -C mvp-app remote set-url origin https://github.com/Razumly/mvp-app.git
    git -C mvp-site remote get-url origin
    git -C mvp-app remote get-url origin

    export CUTOVER_DATE=YYYYMMDD
    export BACKUP_ROOT=/path/outside/StudioProjects/bracketiq-monorepo-backup-$CUTOVER_DATE
    mkdir -p "$BACKUP_ROOT"
    git clone --mirror https://github.com/Razumly/mvp-site.git "$BACKUP_ROOT/mvp-site.git"
    git clone --mirror https://github.com/Razumly/mvp-app.git "$BACKUP_ROOT/mvp-app.git"
    git -C "$BACKUP_ROOT/mvp-site.git" fsck --full
    git -C "$BACKUP_ROOT/mvp-app.git" fsck --full
    git -C "$BACKUP_ROOT/mvp-site.git" bundle create "$BACKUP_ROOT/mvp-site.bundle" --all
    git -C "$BACKUP_ROOT/mvp-app.git" bundle create "$BACKUP_ROOT/mvp-app.bundle" --all
    sha256sum "$BACKUP_ROOT/mvp-site.bundle" "$BACKUP_ROOT/mvp-app.bundle"

Create annotated source tags from approved clean default-branch tips and push only those tags.

    git -C mvp-site tag -a "pre-monorepo-site-$CUTOVER_DATE" main -m "Site source before BracketIQ monorepo migration"
    git -C mvp-app tag -a "pre-monorepo-mobile-$CUTOVER_DATE" master -m "Mobile source before BracketIQ monorepo migration"
    git -C mvp-site push origin "pre-monorepo-site-$CUTOVER_DATE"
    git -C mvp-app push origin "pre-monorepo-mobile-$CUTOVER_DATE"

Build the candidate only in a new temporary directory.

    export WORK="$(mktemp -d)"
    python3 -m venv "$WORK/filter-repo-venv"
    "$WORK/filter-repo-venv/bin/pip" install git-filter-repo==2.47.0
    git clone https://github.com/Razumly/mvp-site.git "$WORK/bracketiq"
    git clone --mirror https://github.com/Razumly/mvp-app.git "$WORK/mvp-app-filtered.git"
    export ORIGINAL_MOBILE_COUNT="$(git -C "$WORK/mvp-app-filtered.git" rev-list --count refs/heads/master)"
    PATH="$WORK/filter-repo-venv/bin:$PATH" git -C "$WORK/mvp-app-filtered.git" filter-repo \
      --to-subdirectory-filter apps/mobile \
      --tag-rename '':'mobile-' \
      --force
    export FILTERED_MOBILE_COUNT="$(git -C "$WORK/mvp-app-filtered.git" rev-list --count refs/heads/master)"
    test "$ORIGINAL_MOBILE_COUNT" = "$FILTERED_MOBILE_COUNT"
    cd "$WORK/bracketiq"
    git switch -c migration/bracketiq-monorepo
    git remote add mobile-history "$WORK/mvp-app-filtered.git"
    git fetch mobile-history refs/heads/master:refs/remotes/mobile-history/master
    git fetch mobile-history '+refs/tags/*:refs/tags/*'
    git merge --allow-unrelated-histories --no-ff refs/remotes/mobile-history/master \
      -m "Merge mvp-app history under apps/mobile"

Perform path moves with explicit `git mv` commands. Re-run `git ls-files | cut -d/ -f1 | sort -u` before moving and reconcile the list with the classification in Milestone 2. Never move untracked files from an active checkout.

After path and workflow edits, run site validation from the candidate:

    cd "$WORK/bracketiq/apps/site"
    npm ci
    npm run prisma:check
    npm run test:ci
    npx tsc --noEmit
    npm run build
    docker build -t bracketiq-site:monorepo-smoke .
    docker compose --env-file .env.docker config --quiet

Run Android validation from the candidate with JDK 17:

    cd "$WORK/bracketiq/apps/mobile"
    ./scripts/tests/google-sign-in-release-resource-contract.sh
    ./scripts/tests/android-release-api-base-url-contract.sh
    ./scripts/tests/ios-release-api-base-url-contract.sh
    ./gradlew :composeApp:testDebugUnitTest --continue --stacktrace
    ./gradlew :composeApp:assembleDebug --stacktrace

Run iOS validation on macOS with JDK 17:

    cd "$WORK/bracketiq/apps/mobile/iosApp"
    pod install
    cd ..
    ./gradlew bootIOSSimulator
    ./gradlew :composeApp:iosSimulatorArm64Test :core:database:iosSimulatorArm64Test \
      --continue --stacktrace

Start the local site with a non-production database through the existing local process controls. Then run these checks. Replace the port only if the checked-in local defaults specify another port.

    curl --fail --silent http://127.0.0.1:3000/api/health/live
    curl --fail --silent http://127.0.0.1:3000/api/health/ready
    cd "$WORK/bracketiq/apps/mobile"
    MVP_TEST_BACKEND_URL=http://127.0.0.1:3000 \
    MVP_TEST_ALLOW_DB_SEED=true \
      ./gradlew :composeApp:testDebugUnitTest \
      --tests 'com.razumly.mvp.eventDetail.EventLifecycleMobileApiIntegrationTest' \
      --stacktrace

Verify history and layout from the candidate root:

    cd "$WORK/bracketiq"
    test -f apps/site/package.json
    test -f apps/mobile/settings.gradle.kts
    test -f CONTEXT.md
    test -f docs/agents/issue-tracker.md
    test -f plans/bracketiq-monorepo-migration-execplan.md
    test -z "$(git submodule status)"
    git log --follow --oneline -- apps/site/package.json
    git log --oneline -- apps/mobile/settings.gradle.kts
    git tag --list 'mobile-*'


After the migration pull request merges, rename the repository through GitHub settings or the GitHub API. Then update a fresh clone's remote and verify redirection.

    git remote set-url origin https://github.com/Razumly/bracketiq.git
    git remote get-url origin
    gh repo view Razumly/bracketiq --json id,nameWithOwner,defaultBranchRef

Do not run a production image publication or deployment command under this ExecPlan without a separate explicit instruction that names that operational state change.

## Validation and Acceptance

The history requirement passes when the target includes the complete approved site default-branch history without changed site commit identifiers, the filtered mobile default branch has the same commit count as its approved source, imported mobile paths live below `apps/mobile`, and mobile tags use the `mobile-` prefix. The archived mobile repository must still expose its original identifiers.

The repository requirement passes when one fresh clone contains `apps/site` and `apps/mobile`, has one root `.github`, one root `PLANS.md`, one root issue-tracker configuration, one root product `CONTEXT.md`, and no nested Git repository or submodule. A developer must not need `MVP_SITE_DIR` for the default local layout.

The site requirement passes when Prisma validation and generation, route-inclusive tests and coverage, TypeScript, the production Next.js build, Docker build, Compose rendering, `/api/health/live`, and `/api/health/ready` succeed from `apps/site`.

The mobile requirement passes when release endpoint scripts, Android unit tests, Android assembly, CocoaPods installation, iOS simulator tests, and the selected real mobile API integration test succeed from `apps/mobile`. The integration test must not report an assumption skip.

The CI requirement passes when the root workflows always report stable site and mobile gate jobs, conditional heavy jobs use the correct application working directory, and branch protection requires only the stable gates. Site-only and mobile-only test pull requests must prove both path decisions before the migration branch merges.

The GitHub requirement passes when `Razumly/bracketiq` is the canonical repository, the existing site issue and pull-request history remains, the `BracketIQ` Project uses the monorepo as its default repository, one auto-add workflow receives a real new issue or pull request, open mobile issues are transferred, and `Razumly/mvp-app` remains archived with a destination link.

The operational requirement passes when production remains unchanged during repository cutover, deployment artifacts point at the new monorepo paths and repository identity, and a local immutable site image builds. A later authorized production release must prove the new GHCR namespace and VM deployment path.

## Idempotence and Recovery

All history rewriting occurs in a disposable mirror. Deleting the temporary candidate and starting again is the normal recovery before merge. Never run filter-repo in either active source repository. Never force-push either source default branch.

The pre-migration tags and verified bundles are immutable recovery points. If the candidate fails before merge, delete the candidate branch and lift the source freeze. If the merged structure fails before repository rename, revert the migration commits on `mvp-site/main` or restore a branch from the site tag. Do not rewrite `main`.

If the repository rename causes an integration failure, rename it back to `mvp-site` while the repository ID and source remain unchanged. If the archived mobile repository is still needed, unarchive it. Do not delete it or its releases.

No database migration is part of this work. No production process, container, timer, worker, database, DNS record, or mobile-store release changes state. Existing production continues to use its last deployed immutable image until a separately authorized release.

Do not copy ignored local secret files into the candidate. Re-provision `.env`, `.env.local`, `local.properties`, `secrets.properties`, `google-services.json`, and other ignored credentials from their approved stores after a fresh clone. The currently tracked `.env.docker` and `iosApp/GoogleService-Info.plist` remain at their application-relative paths.

## Artifacts and Notes

Keep a private migration evidence directory outside Git. It must contain the two source bundle checksums, source tip identifiers, tag list, branch and pull-request inventory, secret and variable names without values, environment names, package names, the filter-repo commit map, imported commit counts, and final fresh-clone transcripts. Never store tokens, secret values, authorization headers, private keys, signing files, or database URLs in this directory or this plan.

Record the final target tree and the following identifiers in this section during execution:

    SITE_SOURCE_SHA=<approved pre-migration site tip>
    MOBILE_SOURCE_SHA=<approved pre-migration mobile tip>
    MONOREPO_MERGE_SHA=<merged target tip>
    SITE_SNAPSHOT_TAG=pre-monorepo-site-<date>
    MOBILE_SNAPSHOT_TAG=pre-monorepo-mobile-<date>
    ORIGINAL_MOBILE_COMMIT_COUNT=<count>
    FILTERED_MOBILE_COMMIT_COUNT=<same count>
    TARGET_REPOSITORY=https://github.com/Razumly/bracketiq
    TARGET_PROJECT=https://github.com/orgs/Razumly/projects/<number>

## Interfaces and Dependencies

The monorepo source interface consists of `apps/site` for web and backend code, `apps/mobile` for all mobile code, root `docs` for product-wide documentation, root `plans` for every new ExecPlan, and root `.github/workflows` for all repository automation. Callers and tests must use these paths directly. Do not add compatibility symlinks named `mvp-site` or `mvp-app`.

The backend HTTP interface remains authoritative. Next.js route handlers and Prisma live in `apps/site`. Kotlin DTOs and Ktor callers live in `apps/mobile/core/network` and `apps/mobile/core/repository-impl`. Co-location does not permit the mobile implementation to import server TypeScript or Prisma types. Contract changes still require compatible server behavior and mobile serialization tests.

Use Git 2.22 or newer and `git-filter-repo==2.47.0` only in a disposable Python virtual environment. Use Node.js 20 or the version already required by `apps/site` development metadata, JDK 17 for Gradle and CocoaPods-triggered Gradle tasks, the checked-in Gradle wrapper under `apps/mobile`, and the existing CocoaPods workspace under `apps/mobile/iosApp`.

The site release interface remains an immutable image tagged with a full monorepo commit SHA. The target image name is `ghcr.io/razumly/bracketiq-site:<40-character-sha>`. Mobile releases keep platform version and build numbers in their current application files. Future Git tags use `site-` or `mobile-` prefixes.

The issue interface is GitHub Issues in `Razumly/bracketiq`. The `BracketIQ` GitHub Project is the shared planning view. The five triage labels remain `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, and `wontfix`.

Revision note (2026-08-17): created the initial history-preserving monorepo migration plan after inspecting both source repositories, their active worktree risks, GitHub Free Project limit, path-sensitive mobile integration, CI split, production image paths, agent configuration, and current organization ownership. No migration action was performed.
