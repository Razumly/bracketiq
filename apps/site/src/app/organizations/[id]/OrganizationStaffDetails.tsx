'use client';

import { CheckCircle2, Mail } from 'lucide-react';
import { Avatar, Badge } from '@/components/organization/organization-operation-ui';
import { ORGANIZATION_PERMISSION_OPTIONS } from '@/lib/organizationPermissions';
import { getUserAvatarUrl, type OrganizationRole } from '@/types';
import type { RoleRosterEntry } from './RoleRosterManager';

export default function OrganizationStaffDetails({ entry, roles }: { entry: RoleRosterEntry | null; roles: OrganizationRole[] }) {
  if (!entry) return <section className="org-reference-card"><h3>Staff details</h3><p>Select a staff member to view their role, contact details, and permissions.</p></section>;
  const role = roles.find((value) => value.$id === entry.roleId);
  const permissions = ORGANIZATION_PERMISSION_OPTIONS.filter((permission) => role?.permissions.includes(permission.value));
  return (
    <section className="org-reference-card org-staff-details">
      <Avatar src={entry.user ? getUserAvatarUrl(entry.user, 64) : undefined} name={entry.fullName} radius="xl" size={48} />
      <h3>{entry.fullName}</h3>
      <p className="org-role-label">{entry.roleName ?? role?.name ?? 'No role assigned'}</p>
      <Badge color={entry.status === 'active' ? 'teal' : 'orange'}>{entry.status}</Badge>
      {entry.email && <p className="org-staff-contact"><Mail />{entry.email}</p>}
      <h4>Permissions</h4>
      {permissions.map((permission) => <p key={permission.value}><CheckCircle2 />{permission.label}</p>)}
      {permissions.length === 0 && <p>Permissions are not available for this role.</p>}
      {entry.subtitle && <p>{entry.subtitle}</p>}
    </section>
  );
}
