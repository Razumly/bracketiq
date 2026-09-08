'use client';

import { useMemo, useState } from 'react';
import { ClipboardList, Plus, Search, UserRound, Users, ShieldCheck } from 'lucide-react';
import { Button, Select, TextInput } from '@/components/organization/organization-operation-ui';
import { OrganizationStatStrip, OrganizationTabHeading } from '@/components/organization/OrganizationTabLayout';
import { OrganizationDataRegion } from '@/components/organization/OrganizationDataLoading';
import type { Team, Division } from '@/types';
import OrganizationTeamSummaryCard, { teamRosterSize } from './OrganizationTeamSummaryCard';
import { teamDivisionLabel } from './organizationTeamLabels';

export type OrganizationTeamsTabContentProps = {
  teams?: Team[] | null;
  divisionDetails?: Division[];
  isTeamManagementAllowed?: boolean;
  onCreateTeam: () => void;
  onTeamClick: (team: Team) => void;
};

function teamCoachIds(team: Team): string[] {
  return [team.headCoachId, ...(team.assistantCoachIds ?? [])].filter((id): id is string => Boolean(id));
}

export default function OrganizationTeamsTabContent({ teams, divisionDetails, isTeamManagementAllowed = false, onCreateTeam, onTeamClick }: OrganizationTeamsTabContentProps) {
  const [search, setSearch] = useState('');
  const [sport, setSport] = useState('');
  const [division, setDivision] = useState('');
  const [roster, setRoster] = useState('');
  const source = useMemo(() => teams ?? [], [teams]);
  const sports = [...new Set(source.map((team) => team.sport).filter(Boolean))];
  const divisions = [...new Set(source.map((team) => teamDivisionLabel(team, divisionDetails)))];
  const filtered = source.filter((team) => {
    if (!team.name.toLowerCase().includes(search.toLowerCase())) return false;
    if (sport && team.sport !== sport) return false;
    if (division && teamDivisionLabel(team, divisionDetails) !== division) return false;
    return !roster || (roster === 'open' ? team.openRegistration && !team.isFull : team.isFull);
  });
  return (
    <section className="org-section">
      <OrganizationTabHeading title="Teams" description="Manage rosters, coaches, and team registration">
        {isTeamManagementAllowed && <Button onClick={onCreateTeam} leftSection={<Plus />}>Create Team</Button>}
      </OrganizationTabHeading>
      <OrganizationStatStrip items={[
        { label: 'teams', value: source.length, icon: <Users /> },
        { label: 'athletes', value: source.reduce((sum, team) => sum + teamRosterSize(team), 0), icon: <UserRound /> },
        { label: 'coaches', value: new Set(source.flatMap(teamCoachIds)).size, icon: <ShieldCheck /> },
        { label: 'open rosters', value: source.filter((team) => team.openRegistration && !team.isFull).length, icon: <ClipboardList /> },
      ]} />
      <div className="org-filter-toolbar org-team-filters">
        <TextInput aria-label="Search teams" placeholder="Search" value={search} onChange={(event) => setSearch(event.currentTarget.value)} leftSection={<Search className="size-4" />} />
        <Select aria-label="Sport" placeholder="Sport" data={sports} value={sport} onChange={(value) => setSport(value ?? '')} clearable />
        <Select aria-label="Division" placeholder="Division" data={divisions} value={division} onChange={(value) => setDivision(value ?? '')} clearable />
        <Select aria-label="Roster status" placeholder="Roster status" data={[{ value: 'open', label: 'Registration open' }, { value: 'full', label: 'Roster full' }]} value={roster} onChange={(value) => setRoster(value ?? '')} clearable />
        <Button variant="subtle" onClick={() => { setSearch(''); setSport(''); setDivision(''); setRoster(''); }}>Clear all</Button>
      </div>
      <OrganizationDataRegion label="teams" layout="cards">
      <div className="org-team-grid">{filtered.map((team) => <OrganizationTeamSummaryCard key={team.$id} team={team} divisions={divisionDetails} onClick={() => onTeamClick(team)} />)}</div>
      {filtered.length === 0 && <p className="org-empty-copy">{source.length ? 'No teams match your filters.' : 'No teams yet.'}</p>}
      </OrganizationDataRegion>
    </section>
  );
}
