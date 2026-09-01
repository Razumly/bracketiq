# BracketIQ single-VM production stack

This directory is the provider-neutral production stack currently running the
BracketIQ site on an OVHcloud US VPS-2 in Hillsboro, Oregon. The provisioned
host uses Ubuntu 26.04 LTS. The application, PostgreSQL, and Redis all run on OVH;
DigitalOcean Spaces remains only for application files and encrypted off-server
PostgreSQL backups.

The VM runs four long-lived containers:

- Caddy is the only public service and owns ports 80 and 443, TLS, the `www` redirect, WebSocket proxying, and the maintenance response.
- The custom Next.js server runs `server.mjs` on the private Compose network.
- PostgreSQL 17 stores application data on a named volume and never publishes port 5432.
- Redis supplies shared rate-limit state and realtime fanout and never publishes port 6379.

`compose.production.yml` is intentionally separate from the `apps/site` development Compose file.

## Production responsibilities

The account owner must:

1. Maintain the OVHcloud account, VPS billing, and recovery-console access.
2. Keep the dedicated deployment SSH private key on approved operator machines; never paste or commit it.
3. Approve the protected GitHub `production` environment when publishing a tested immutable image.
4. Maintain live-only secrets directly in `/opt/bracketiq/deploy/vm/app.env`; never send their values in chat.
5. Approve future DNS, destructive database, or non-backward-compatible migration changes at their explicit gates.

## Files that must remain secret

On the VM, create these files from their tracked examples:

    deployment.env
    app.env
    migration.env
    postgres.env
    redis.env
    /etc/bracketiq/restic.env

Set mode `0600`. `app.env` uses the limited runtime database role. `migration.env` uses the owner role and is loaded only by the one-off migration service. URL-encode database and Redis passwords when placing them inside URLs. Preserve `AUTH_SECRET` and all existing webhook verification secrets through the cutover so sessions and provider callbacks remain valid.

The tracked `app.env.example` is an inventory aid, not an assertion that every
optional integration is enabled. Compare it with the current OVH `app.env`
inventory whenever integrations change.

## Initial VM layout

Use a non-root deployment account and keep the checkout at `/opt/bracketiq`:

    sudo install -d -m 0755 -o bracketiq -g bracketiq /opt/bracketiq
    sudo install -d -m 0700 -o root -g root /etc/bracketiq /var/lib/bracketiq

Install Docker Engine and the Compose plugin from Docker's official Ubuntu repository. Install the PostgreSQL 17 client and Restic from supported repositories. Enable unattended security upgrades. Initially rate-limit inbound TCP 22 with key-only authentication and Fail2ban; restrict it to a stable operator or VPN CIDR later if one is available. Allow TCP 80 and 443 plus UDP 443 publicly, and deny 3000, 5432, and 6379. Configure at least 2 GiB swap as an emergency cushion even though the selected VPS has 8 GiB RAM.

## Trusted SSH management addresses

Keep Fail2ban and the UFW SSH rate limit enabled. Add only trusted operator IP
addresses (normally a single `/32` IPv4 or `/128` IPv6 address) to the durable
Fail2ban allowlist:

    curl --fail --silent --show-error https://api.ipify.org
    sudo bracketiq-ssh-allowlist add 203.0.113.10
    sudo bracketiq-ssh-allowlist list

The helper validates the address, persists it in
`/etc/fail2ban/jail.d/bracketiq-sshd-allowlist.local`, and restarts Fail2ban so
the change takes effect. Run it from an already approved connection or the OVH
web console before opening a new SSH session. Remove an obsolete address with
`sudo bracketiq-ssh-allowlist remove <ip-or-cidr>`. Do not approve a broad ISP
range merely to accommodate a changing residential address.

Do not use a floating `latest` application tag. After the push-triggered `Site CI`
workflow passes on `main`, publish an image with the manual GitHub workflow and
copy the full commit-SHA tag into `deployment.env`. The publish workflow rejects
commits without a successful site CI run for that exact SHA.

## Validate configuration without exposing secrets

From `apps/site/deploy/vm` on the VM:

    docker compose --env-file deployment.env -f compose.production.yml config --quiet
    docker compose --env-file deployment.env -f compose.production.yml up -d postgres redis
    docker compose --env-file deployment.env -f compose.production.yml --profile tools run --rm migrate

Never run `docker compose config` without `--quiet` in shared logs because it can render resolved environment values.

## Deploy and roll back the app image

Run:

    ./bin/deploy.sh ghcr.io/razumly/bracketiq-site:<full-commit-sha>

The script accepts only a full commit SHA or image digest, verifies that the
exact commit has a completed successful push-triggered `Site CI` run on `main`,
waits for database readiness, and restores the previously recorded image if the new
container becomes unhealthy. A digest deployment must also set
`DEPLOY_COMMIT_SHA` to the tested 40-character commit. If a push does not need a
backend redeploy, do not publish or deploy an image; CI still runs for the push.
Set `RUN_MIGRATIONS=true` only when the migration-owner URL is correct and the
release actually needs schema deployment. The CI verification happens before
the migration container or application is changed. Application rollback does
not reverse database migrations; after a non-backward-compatible migration,
roll forward with a fixed image.

## Maintenance mode

Enable maintenance without changing the image:

    touch maintenance/enabled

Caddy then returns HTTP 503 with `Retry-After` for ordinary requests but continues proxying the liveness and readiness routes. Disable it with:

    rm maintenance/enabled

Maintenance is required for the final database copy. Do not accept writes in both the managed and self-hosted databases.

## Encrypted database backups and restore drills

Initialize the Restic repository once after populating `/etc/bracketiq/restic.env`:

    sudo sh -c 'set -a; . /etc/bracketiq/restic.env; set +a; exec restic init'

Install the tracked systemd units under `/etc/systemd/system`, then enable the hourly timer only after a manual backup succeeds:

    sudo systemctl daemon-reload
    sudo systemctl start bracketiq-postgres-backup.service
    sudo systemctl enable --now bracketiq-postgres-backup.timer

The backup script streams a custom-format dump directly to encrypted Restic storage and keeps 48 hourly, 14 daily, 8 weekly, and 12 monthly snapshots. It does not create a plaintext dump on the VM.

For a restore drill, create a new empty database, identify the snapshot and stored path with `restic snapshots` and `restic ls`, then run:

    RESTIC_SNAPSHOT=<snapshot-id> \
    RESTIC_DUMP_PATH=/bracketiq/postgres/<timestamp>.dump \
    TARGET_DATABASE=bracketiq_restore_drill \
    sudo --preserve-env=RESTIC_SNAPSHOT,RESTIC_DUMP_PATH,TARGET_DATABASE \
      ./bin/restore-postgres.sh

The restore script refuses a non-empty target. It also refuses the live database unless `ALLOW_LIVE_DATABASE_RESTORE` exactly matches the live database name. A successful backup is not considered production-ready until this restore drill passes.

## Completed cutover record

The public DNS, application runtime, PostgreSQL, and Redis cutover to OVH is
complete. Do not treat any retired hosted application or managed database as
current production. The historical gates, evidence, and rollback boundaries
remain recorded in `../../../../docs/ovh-vps-migration-execplan.md`.

## Affiliate source discovery and intake automation

The application image includes the provider-neutral automation command. Use
this automation only in a non-production environment. Do not install, start,
or enable its service or timer on a production host.

For non-production checks, use a disposable database and complete these steps:

- Set `SCRAPINGDOG_API_KEY` in `app.env`.
- Set `AFFILIATE_OPERATIONAL_ALERT_WEBHOOK_URL` or
  `AFFILIATE_OPERATIONAL_ALERT_EMAIL_TO`.
- Set email credentials when you use email alerts.
- Set database and storage credentials for that non-production database.
- Deploy the discovery and intake migrations in that non-production database.
- Create paused campaign templates with `npm run affiliate:discovery:setup --
  --live` only in that non-production environment.
- Review campaign limits in Admin > Affiliate Operations > Source Intake.

Do not copy these non-production settings or commands into a production
deployment. Use governed gateway admission for production work.

New discovery and intake runs use ScrapingDog by default.
Set `FIRECRAWL_API_KEY` when you select Firecrawl.

ScrapingDog provider controls:

- `AFFILIATE_DISCOVERY_PROVIDER=SCRAPINGDOG|FIRECRAWL`
- `AFFILIATE_INTAKE_PROVIDER=SCRAPINGDOG|FIRECRAWL`
- `AFFILIATE_PROVIDER_FALLBACK=NONE|FIRECRAWL`
- `AFFILIATE_INTAKE_SCREENSHOT_MODE=first|all|none` (defaults to `first` to avoid a separate screenshot request for every selected page)
- `SCRAPINGDOG_TIMEOUT_MS=300000`
- `SCRAPINGDOG_DYNAMIC_WAIT_MS=2500`

The intake worker first requests static HTML.
It retries once with JavaScript rendering when the local quality gate rejects the static response.
It converts raw HTML to Markdown.
It discovers sitemap and link pages locally.
Operational summaries estimate ScrapingDog usage at 1 credit for static capture, 5 for JavaScript capture, 5 for Google Search, and 5 for a screenshot.
The provider dashboard remains the billing authority.

The legacy discovery and intake timer is disabled for production. Do not
install, start, or enable these units during cutover. The service has a
sentinel-file guard, and the production script rejects both `NODE_ENV=production`
and `--live`. Use governed gateway admission for production work.

Keep the units in the repository as rollback evidence only. Keep the timer
disabled:

    systemctl is-enabled bracketiq-affiliate-intake-automation.timer
    systemctl is-active bracketiq-affiliate-intake-automation.timer

The command must report `disabled` and `inactive`. Do not create
`/etc/bracketiq/legacy-affiliate-intake-enabled`. Do not run
`npm run affiliate:intake:automation` against a production database.

Use a non-production database for local provider and parsing checks. Existing
organizations, approved scrape sources, intakes, artifacts, and candidates
remain intact.

## Daily mapped-source scraping

The daily mapped-source service is a legacy direct writer. It is not a
governed worker. Keep it stopped while the governed affiliate cohort is
authoritative. Do not install, start, or enable its service or timer on a
production host during cutover:

    systemctl is-enabled bracketiq-affiliate-scrape-daily.timer
    systemctl is-active bracketiq-affiliate-scrape-daily.timer

If the units exist, the commands must report `disabled` and `inactive`. Keep
the units in the repository as rollback evidence only. Use governed gateway
admission for production refreshes. Do not run
`npm run affiliate:scrape:due` against a production database.

Run mapped-source scraping only in a non-production environment. Use a
non-production database and provider credentials for local mapping and parser
checks. Record the environment in the test evidence.
