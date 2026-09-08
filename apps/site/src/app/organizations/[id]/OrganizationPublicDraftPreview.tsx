'use client';

import { useState } from 'react';
import Image from 'next/image';
import { Monitor, Smartphone } from 'lucide-react';
import type { Organization } from '@/types';
import { Button } from '@/components/organization/organization-operation-ui';

export default function OrganizationPublicDraftPreview({ organization, headline, intro, primary, accent }: {
  organization: Organization; headline: string; intro: string; primary: string; accent: string;
}) {
  const [mobile, setMobile] = useState(false);
  const logo = organization.logoUrl || (organization.logoId ? `/api/files/${organization.logoId}/preview?w=128&h=128&fit=contain` : null);
  return <section className="org-public-preview org-reference-card" aria-label="Public page draft preview">
    <header><h3>Live preview</h3><div className="org-section-actions">
      <Button variant="subtle" aria-label="Desktop preview" aria-pressed={!mobile} onClick={() => setMobile(false)}><Monitor size={18} /></Button>
      <Button variant="subtle" aria-label="Mobile preview" aria-pressed={mobile} onClick={() => setMobile(true)}><Smartphone size={18} /></Button>
    </div></header>
    <div className="org-public-preview-page" data-mobile={mobile}>
      <div className="org-public-preview-cover" style={{ backgroundColor: primary }}>
        {organization.imageUrl && <Image src={organization.imageUrl} alt="" fill unoptimized className="object-cover" />}
      </div>
      <div className="org-public-preview-identity">
        {logo ? <Image src={logo} alt={`${organization.name} logo`} width={88} height={88} unoptimized className="object-contain" /> : <span className="org-public-preview-initial">{organization.name.charAt(0)}</span>}
        <div><h4>{organization.name}</h4>{headline && <p>{headline}</p>}</div>
      </div>
      <div className="org-public-preview-content">
        <div className="org-public-preview-navigation" style={{ borderBottomColor: accent }}>Overview</div>
        <h4>About</h4><p>{intro || organization.description || 'Add an introduction to tell visitors about your organization.'}</p>
        {organization.location && <p>{organization.location}</p>}
        {organization.website && <p>{organization.website}</p>}
      </div>
      <p className="org-public-preview-note">This preview shows your draft text and colors. Open the saved public page to check its events, teams, and rentals.</p>
    </div>
  </section>;
}
