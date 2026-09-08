'use client';

import { CircleDot, Users } from 'lucide-react';
import { Avatar, Button } from '@/components/organization/organization-operation-ui';
import { getTeamAvatarUrl, getUserAvatarUrl, getUserFullName, type Team, type Division } from '@/types';
import { teamDivisionLabel } from './organizationTeamLabels';

export function teamRosterSize(team: Team): number {
  return team.currentSize ?? team.players?.length ?? team.playerIds.length;
}

export default function OrganizationTeamSummaryCard({ team, divisions, onClick }: { team: Team; divisions?: Division[]; onClick: () => void }) {
  const coach = team.headCoach;
  const players = (team.players ?? []).filter((player) => !player.isIdentityHidden);
  const count = teamRosterSize(team);
  const status = team.isFull ? 'Roster full' : team.openRegistration ? 'Registration open' : 'Active';
  return (
    <article className="org-team-summary">
      <div className="org-team-identity">
        <Avatar src={getTeamAvatarUrl(team, 96)} name={team.name} size={76} radius="xl" />
        <div>
          <button type="button" className="org-team-name" onClick={onClick}>{team.name}</button>
          <span className="org-team-sport"><CircleDot />{team.sport}</span>
          <span className="org-team-division">{teamDivisionLabel(team, divisions)}</span>
        </div>
      </div>
      <div className="org-team-roster">
        <div className="org-team-coach">
          {coach ? <><Avatar src={getUserAvatarUrl(coach, 40)} name={getUserFullName(coach)} size={28} radius="xl" /><span>{getUserFullName(coach)} · Coach</span></> : <span className="text-muted-foreground">No coach assigned</span>}
        </div>
        <div className="org-team-members">
          <div className="org-avatar-stack">{players.slice(0, 4).map((player) => <Avatar key={player.$id} src={getUserAvatarUrl(player, 40)} name={getUserFullName(player)} size={28} radius="xl" />)}</div>
          <span><Users aria-hidden="true" />{count}{team.teamSize > 0 ? ' / ' + team.teamSize : ''} athletes</span>
        </div>
        <div className="org-team-footer"><span data-full={team.isFull}>{status}</span><Button variant="outline" size="sm" onClick={onClick}>View roster</Button></div>
      </div>
    </article>
  );
}
