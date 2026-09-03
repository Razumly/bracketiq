'use client';

import type { ComponentProps } from 'react';

import { Stack, Text } from '@/components/organization/organization-operation-ui';
import RoleRosterManager from './RoleRosterManager';

type RoleRosterManagerProps = ComponentProps<typeof RoleRosterManager>;

export type OrganizationStaffTabContentProps = RoleRosterManagerProps & {
  rosterNameError: string | null;
};

export default function OrganizationStaffTabContent({
  rosterNameError,
  ...rosterProps
}: OrganizationStaffTabContentProps) {
  return (
    <Stack gap="sm">
      {rosterNameError ? <Text c="red" size="sm" mb="sm">{rosterNameError}</Text> : null}
      <RoleRosterManager {...rosterProps} />
    </Stack>
  );
}
