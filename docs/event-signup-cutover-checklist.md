# Event signup cutover checklist

Issue: [#153](https://github.com/Razumly/bracketiq/issues/153).

Status: Integration verification is complete. Production conversion and deployment were not performed.

## Release gates

- Complete the 67 User Stories and 28 behavioral checks in `event-signup-integration-evidence.md`.
- Verify new and returning managers in the desktop site, narrow site, and Android application.
- Verify saved registration drafts in both client directions.
- Verify explicit final registration confirmation.
- Record the platform limits of each verification run. This Windows run provides Android and JVM evidence. It provides no native iOS evidence.
- Pass the final site, mobile, database, and client-to-site checks.
- Resolve the final Standards and Spec review findings.
- Obtain separate authorization for production migration and deployment.

## Existing-data preparation

Rehearse this procedure on an isolated database first. Use a database backup that can be restored. Do not print contact addresses or signed claim links in the preparation report.

1. Apply the repository Prisma migrations.
2. Confirm that no migration is pending.
3. Run `node node_modules/tsx/dist/cli.mjs scripts/prepare-legacy-player-invitations.ts inspect` from `apps/site`.
4. Review each candidate's stored profile, verified Account contact, guardian contact, latest invitation attempt, and Event scope.
5. Resolve ambiguous identities before conversion.
6. Run `apply` with the reviewed invitation IDs. Each transaction accepts at most 100 IDs.
7. Repeat the same batch to verify stable profile IDs and roster placement.
8. Verify claim previews through the existing signed links.
9. Verify that no Account or notification was created by preparation.
10. Verify that completed Event snapshots and document evidence are unchanged.

Preparation uses stored profile IDs and exact Account email matches. It does not match names. It does not change invitation outcomes or link versions. A failed batch rolls back all profile, roster, and invitation writes. Preserve terminal invitation history for the existing retention process.

## Client contract

The public `GET /api/public/team-invites/[id]` response adds the optional `invite.profileClaimRequired` boolean. The site uses this field to open the Player profile claim form. An old generic share-link claim for an unclaimed Player receives HTTP 409. It must not bind the Account that merely reviews the link. Native clients use the dedicated profile claim endpoint. No existing required field changes shape or version.

The public Event detail response now includes `teamSizeLimit`, `singleDivision`, and `registrationPaymentMode`. These existing optional fields describe registration rules. The response still excludes private roster identities, manual payment links, and manual payment instructions. Mobile participant refresh applies the partial Event header to the complete cached Event. It preserves sport, Team size, location, and other omitted details. It applies cleared values for the header's selected nullable fields. No Room schema change is required for this merge correction.

The existing invitationLabel field now uses Awaiting player or Awaiting guardian for a pending attempt. Both views use the current Player birthdate. A retained expired attempt still uses Invitation expired. This changes label values only. Mobile membership normalization now preserves the existing invitationId and invitationLabel fields. API refresh writes these values to Room. This adds no required response field or Room column.

## Transient mobile claim preview

`ManagedPlayerClaimComponent` owns the signed-link form state. Its preview is transient. It contains limited claim context for one invitation and one Account. It is not a cached Player detail or roster record. Do not persist the signed link or its preview in Room.

The screen creates a new component when the Account or link changes. It clears the preview before loading. It cancels pending form actions and clears the preview when the screen closes. Each claim command rechecks authority and link validity on the server. The preview never authorizes a write.

After a successful command, repository refreshes write profile and invitation data to Room. The application observes those Room records. If a refresh fails after a saved command, the form reports the saved action and the refresh failure separately.

## Deployment and recovery

Keep site and mobile releases separate. Do not deploy while a release gate remains open. Do not start production conversion from this checklist without current authorization.

Keep the database backup and the list of reviewed batches with the release record. If preparation fails, inspect the error and resolve the named records. Retry the same batch after correction. Do not delete Profiles, rewrite signed evidence, or restore old invitation outcomes to resolve an error.

If a deployed client cannot use the new contract, stop the rollout under an authorized recovery procedure. Preserve the database state and document evidence. Do not roll back to a client that can bind a forwarded Player link to the wrong Account.
