-- Preserve documents.import for renamed default administrative roles.

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
  WHERE role."isDefault" = TRUE
    AND role."kind" IN ('STAFF', 'HOST')
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
