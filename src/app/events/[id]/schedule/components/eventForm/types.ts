import type { Event, Organization, RegistrationQuestionDraft, UserData } from '@/types';
import type { EventStaffSnapshot } from '@/lib/eventStaffService';
import type { EventEditorDraft, EventEditorSnapshot } from '@/contracts/eventEditor';
export type DefaultLocation = {
    location?: string;
    address?: string;
    coordinates?: [number, number];
};

export type RentalPurchaseContext = {
    start: string;
    end: string;
    fieldId?: string;
    organization?: Organization | null;
    organizationEmail?: string | null;
    priceCents?: number;
    requiredTemplateIds?: string[];
};

export interface EventFormProps {
    isOpen?: boolean;
    onClose?: () => void;
    currentUser: UserData;
    snapshot: EventEditorSnapshot;
    formId?: string;
    defaultLocation?: DefaultLocation;
    isCreateMode?: boolean;
    initialSetupMode?: 'SIMPLE' | 'ADVANCED';
    rentalPurchase?: RentalPurchaseContext;
    immutableDefaults?: Partial<Event> & { immutableFieldNames?: string[] };
    templateOrganizationId?: string;
    onDirtyStateChange?: (hasChanges: boolean) => void;
    onDraftStateChange?: (state: {
        draft: EventEditorDraft;
        baselineDraft: EventEditorDraft;
    }) => void;
    onValidityChange?: (isValid: boolean) => void;
    onSubmitRequest?: () => void;
}
export type EventFormHandle = {
    getRegistrationQuestionDrafts: () => RegistrationQuestionDraft[];
    validate: () => Promise<boolean>;
    getValidationErrors: () => Array<{ path: string; message: string }>;
    validatePendingStaffAssignments: () => Promise<void>;
    commitDirtyBaseline: () => void;
    applyCanonicalStaffState: (snapshot: EventStaffSnapshot) => void;
};
