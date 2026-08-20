import { useEffect, useRef, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';

import { fieldService } from '@/lib/fieldService';
import { organizationService } from '@/lib/organizationService';
import { sortFieldsByCreatedAt } from '@/lib/fieldUtils';
import type { Field, Organization } from '@/types';

import {
    mergeOrganizationFieldsIntoPool,
    removeOrganizationFieldsFromPool,
} from '../resourceGroups';

type SetFields = (
    updater: SetStateAction<Field[]>,
    options?: { shouldDirty?: boolean; shouldValidate?: boolean },
) => void;

type UseOrganizationFieldHydrationParams = {
    hasRestrictedImmutableFields: boolean;
    isEditMode: boolean;
    organizationFieldSignature: string;
    organizationId: string;
    resolvedOrganizationFields?: Field[] | null;
    resolvedOrganizationId?: string | null;
    sanitizeFields: (fields?: Field[] | null) => Field[];
    setFields: SetFields;
    setHydratedOrganization: Dispatch<SetStateAction<Organization | null>>;
};

export const useOrganizationFieldHydration = ({
    hasRestrictedImmutableFields,
    isEditMode,
    organizationFieldSignature: _organizationFieldSignature,
    organizationId,
    resolvedOrganizationFields,
    resolvedOrganizationId,
    sanitizeFields,
    setFields,
    setHydratedOrganization,
}: UseOrganizationFieldHydrationParams) => {
    const [fieldsLoading, setFieldsLoading] = useState(false);
    const resolvedOrganizationFieldsRef = useRef(resolvedOrganizationFields);
    const resolvedOrganizationIdRef = useRef(resolvedOrganizationId);
    const sanitizeFieldsRef = useRef(sanitizeFields);
    const setFieldsRef = useRef(setFields);
    const setHydratedOrganizationRef = useRef(setHydratedOrganization);
    resolvedOrganizationFieldsRef.current = resolvedOrganizationFields;
    resolvedOrganizationIdRef.current = resolvedOrganizationId;
    sanitizeFieldsRef.current = sanitizeFields;
    setFieldsRef.current = setFields;
    setHydratedOrganizationRef.current = setHydratedOrganization;

    useEffect(() => {
        let cancelled = false;

        if (isEditMode) {
            return () => {
                cancelled = true;
            };
        }

        if (hasRestrictedImmutableFields) {
            return () => {
                cancelled = true;
            };
        }

        if (!organizationId) {
            return () => {
                cancelled = true;
            };
        }

        const hydrateOrganizationFields = async () => {
            const seededFields = Array.isArray(resolvedOrganizationFieldsRef.current)
                ? sortFieldsByCreatedAt(sanitizeFieldsRef.current(resolvedOrganizationFieldsRef.current))
                : [];
            if (seededFields.length) {
                setFieldsRef.current(
                    (previous) => mergeOrganizationFieldsIntoPool(previous, seededFields, organizationId),
                    { shouldDirty: false, shouldValidate: false },
                );
                setFieldsLoading(false);
                return;
            }

            try {
                setFieldsLoading(true);
                const fetchedOrganization = await (
                    organizationService.getOrganizationByIdForEventForm
                        ? organizationService.getOrganizationByIdForEventForm(organizationId)
                        : organizationService.getOrganizationById(organizationId, true)
                );
                if (cancelled) return;
                if (fetchedOrganization) {
                    setHydratedOrganizationRef.current(fetchedOrganization);
                }

                const latestSeededFields = Array.isArray(resolvedOrganizationFieldsRef.current)
                    ? sortFieldsByCreatedAt(
                        sanitizeFieldsRef.current(resolvedOrganizationFieldsRef.current),
                    )
                    : [];
                let resolvedFields = Array.isArray(fetchedOrganization?.fields)
                    ? sortFieldsByCreatedAt(sanitizeFieldsRef.current(fetchedOrganization.fields as Field[]))
                    : latestSeededFields;
                if (!resolvedFields.length) {
                    const fallbackOrganizationId = fetchedOrganization?.$id
                        ?? resolvedOrganizationIdRef.current
                        ?? organizationId;
                    if (fallbackOrganizationId) {
                        const fetchedFields = await fieldService.listFields({ organizationId: fallbackOrganizationId });
                        if (cancelled) return;
                        resolvedFields = sortFieldsByCreatedAt(sanitizeFieldsRef.current(fetchedFields));
                    }
                }
                if (resolvedFields.length) {
                    setFieldsRef.current(
                        (previous) => mergeOrganizationFieldsIntoPool(previous, resolvedFields, organizationId),
                        { shouldDirty: false, shouldValidate: false },
                    );
                } else {
                    setFieldsRef.current(
                        (previous) => removeOrganizationFieldsFromPool(previous, organizationId),
                        { shouldDirty: false, shouldValidate: false },
                    );
                }
            } catch (error) {
                console.warn('Failed to hydrate organization fields for event form:', error);
            } finally {
                if (!cancelled) {
                    setFieldsLoading(false);
                }
            }
        };

        hydrateOrganizationFields();

        return () => {
            cancelled = true;
        };
    }, [
        hasRestrictedImmutableFields,
        isEditMode,
        organizationId,
    ]);

    return { fieldsLoading };
};
