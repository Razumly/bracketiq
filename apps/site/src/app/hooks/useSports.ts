'use client';

import { useEffect, useMemo, useState } from 'react';
import type { Sport } from '@/types';
import { sportsService, type SportCatalog } from '@/lib/sportsService';

export const useSports = () => {
  const initialCatalog = useMemo(
    () => sportsService.getCachedCatalog({ allowStale: true }) ?? { sports: [], categories: [] },
    [],
  );
  const [catalog, setCatalog] = useState<SportCatalog>(initialCatalog);
  const [loading, setLoading] = useState<boolean>(initialCatalog.sports.length === 0);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let active = true;

    const load = async () => {
      try {
        if (!initialCatalog.sports.length) {
          setLoading(true);
        }
        const data = await sportsService.getCatalog(true);
        if (!active) return;
        setCatalog(data);
        setError(null);
      } catch (err) {
        if (!active) return;
        setError(err instanceof Error ? err : new Error('Failed to load sports'));
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    load();

    return () => {
      active = false;
    };
  }, [initialCatalog.sports.length]);

  const sportsById = useMemo(() => {
    const map = new Map<string, Sport>();
    catalog.sports.forEach((sport) => {
      if (sport.$id) {
        map.set(sport.$id, sport);
      }
    });
    return map;
  }, [catalog.sports]);

  const sportsByName = useMemo(() => {
    const map = new Map<string, Sport>();
    catalog.sports.forEach((sport) => {
      map.set(sport.name.toLowerCase(), sport);
    });
    return map;
  }, [catalog.sports]);

  return {
    sports: catalog.sports,
    categories: catalog.categories,
    sportsById,
    sportsByName,
    loading,
    error,
  };
};
