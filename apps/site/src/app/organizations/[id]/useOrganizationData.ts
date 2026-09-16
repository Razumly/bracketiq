'use client';

import { useCallback, useRef, useState } from 'react';
import { organizationService } from '@/lib/organizationService';
import type { Organization } from '@/types';
import type { OrganizationTab } from './organizationTabs';

type LoadOptions = { silent?: boolean; isRelationsIncluded?: boolean; tabRefresh?: OrganizationTab };
type LoadingState = { loading: boolean; error: string | null; tab: OrganizationTab | null };
const READY: LoadingState = { loading: false, error: null, tab: null };

async function readOrganization(orgId: string, includeRelations: boolean) {
  const data = await organizationService.getOrganizationById(orgId, includeRelations);
  if (!data) throw new Error('The Organization was not found or is not available to this account.');
  return data;
}

export function useOrganizationData(requestedTab: OrganizationTab) {
  const [org, setOrg] = useState<Organization>();
  const [state, setState] = useState<LoadingState>({ ...READY, loading: true });
  const loadedId = useRef<string | null>(null);
  const latestRequest = useRef(0);

  const beginLoad = useCallback((orgId: string, options: LoadOptions) => {
    if (options.silent) return;
    const hasOrganization = loadedId.current === orgId;
    if (!hasOrganization) setOrg(undefined);
    setState({
      loading: !hasOrganization,
      tab: hasOrganization ? options.tabRefresh ?? requestedTab : null,
      error: null,
    });
  }, [requestedTab]);

  const loadOrg = useCallback(async (orgId: string, options: LoadOptions = {}) => {
    const request = ++latestRequest.current;
    beginLoad(orgId, options);
    try {
      const data = await readOrganization(orgId, options.isRelationsIncluded ?? requestedTab !== 'users');
      if (request !== latestRequest.current) return;
      loadedId.current = orgId;
      setOrg(data);
      setState(READY);
    } catch (error) {
      if (request !== latestRequest.current) return;
      console.error('Failed to load organization', error);
      setState({
        ...READY,
        error: error instanceof Error ? error.message : 'The Organization overview is not available right now.',
      });
    }
  }, [beginLoad, requestedTab]);

  return { org, setOrg, loadOrg, loading: state.loading, organizationLoadError: state.error, organizationLoadingTab: state.tab };
}
