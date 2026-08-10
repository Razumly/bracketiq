import { useState } from 'react';

import type { RegistrationQuestionInput } from '@/contracts/eventEditor';
import type { RegistrationQuestionDraft } from '@/types';

type UseRegistrationQuestionDraftsParams = {
    eventId?: string | null;
    isCreateMode: boolean;
    open: boolean;
    snapshotQuestions: readonly RegistrationQuestionInput[];
};

const toDraft = (question: RegistrationQuestionInput): RegistrationQuestionDraft => ({
    ...(('id' in question) ? { id: question.id } : { clientId: question.clientId }),
    prompt: question.prompt,
    answerType: question.answerType,
    required: question.required,
    sortOrder: question.sortOrder,
});

export const useRegistrationQuestionDrafts = ({
    open,
    snapshotQuestions,
}: UseRegistrationQuestionDraftsParams) => {
    const [drafts, setDrafts] = useState<RegistrationQuestionDraft[]>(() => snapshotQuestions.map(toDraft));
    const [error, setError] = useState<string | null>(null);


    return {
        drafts,
        setDrafts,
        loading: false,
        error,
    };
};
