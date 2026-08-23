-- Add document-specific organization permissions and durable user notices.

WITH document_permissions AS (
  SELECT permission
  FROM (
    VALUES
      ('documents.import')
  ) AS permission_rows(permission)
),
role_permissions AS (
  SELECT role."id" AS "roleId", document_permissions.permission
  FROM "OrganizationRoles" role
  CROSS JOIN document_permissions
  WHERE role."name" IN ('Admin', 'Staff', 'Host')
)
INSERT INTO "OrganizationRolePermissions" (
  "id",
  "createdAt",
  "updatedAt",
  "organizationRoleId",
  "permission"
)
SELECT
  CONCAT(
    'org_role_perm_',
    REPLACE(role_permissions."roleId", '-', ''),
    '_',
    REPLACE(REPLACE(role_permissions.permission, '.', '_'), '-', '_')
  ),
  NOW(),
  NOW(),
  role_permissions."roleId",
  role_permissions.permission
FROM role_permissions
ON CONFLICT ("organizationRoleId", "permission") DO NOTHING;

CREATE TABLE IF NOT EXISTS "UserNotifications" (
  "id" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "userId" TEXT NOT NULL,
  "notificationType" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "data" JSONB,
  "readAt" TIMESTAMP(3),
  CONSTRAINT "UserNotifications_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "UserNotifications_userId_readAt_createdAt_idx"
ON "UserNotifications"("userId", "readAt", "createdAt");

CREATE INDEX IF NOT EXISTS "UserNotifications_notificationType_createdAt_idx"
ON "UserNotifications"("notificationType", "createdAt");
