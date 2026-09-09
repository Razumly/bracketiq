import { z } from "zod";

const appVersionReleaseSchema = z
  .object({
    platform: z.enum(["IOS", "ANDROID"]),
    versionName: z.string(),
    buildNumber: z.number().int().nullable(),
    changes: z.array(z.string()),
    hasBreakingChanges: z.boolean(),
    updateUrl: z.string().nullable(),
    releasedAt: z.string().nullable(),
  })
  .strict();

export const appVersionResponseSchema = z
  .object({
    updateAvailable: z.boolean(),
    updateRequired: z.boolean(),
    latestVersion: appVersionReleaseSchema.nullable(),
    releases: z.array(appVersionReleaseSchema),
  })
  .strict();

export const appVersionIsolationProbeResponseSchema = appVersionResponseSchema
  .extend({
    outboundProvidersDisabled: z.boolean(),
    databaseUrlHash: z.string().nullable(),
  })
  .strict();

export type AppVersionResponse = z.infer<typeof appVersionResponseSchema>;
export type AppVersionIsolationProbeResponse = z.infer<
  typeof appVersionIsolationProbeResponseSchema
>;
