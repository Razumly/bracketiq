'use client';

import { useEffect, useId, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Copy, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Field, FieldError, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Textarea } from '@/components/ui/textarea';
import {
  createFeedbackSubmission,
  type CreateFeedbackRequest,
  type CreateFeedbackResponse,
  type FeedbackEntrySource,
  type FeedbackSubmissionType,
} from '@/lib/feedbackService';
import {
  normalizeFeedbackPathCategory,
  trackFeedbackSubmitted,
} from '@/lib/analytics/feedbackAnalytics';

export type FeedbackFormProps = {
  currentPagePath?: string;
  authenticatedEmail?: string | null;
  entrySource: FeedbackEntrySource;
  draft?: Partial<FeedbackFormDraft>;
  onDraftChange?: (draft: FeedbackFormDraft) => void;
  onSuccess?: (response: CreateFeedbackResponse) => void;
  onCancel?: () => void;
  onDone?: () => void;
};

export type FeedbackFormDraft = {
  type: FeedbackSubmissionType;
  message: string;
  additionalContext: string;
  allowContact: boolean;
  contactEmail: string;
  companyWebsite: string;
};

type FeedbackDraftUpdater = <K extends keyof FeedbackFormDraft>(
  key: K,
  value: FeedbackFormDraft[K],
) => void;

const feedbackTypeOptions: Array<{ value: FeedbackSubmissionType; label: string }> = [
  { label: 'Bug', value: 'BUG' },
  { label: 'Idea', value: 'IDEA' },
  { label: 'General', value: 'GENERAL' },
];

const feedbackContextLabels: Partial<Record<FeedbackSubmissionType, string>> = {
  BUG: 'What did you expect to happen?',
  IDEA: 'What are you trying to accomplish?',
};

const initialFormState = (
  authenticatedEmail?: string | null,
  draft?: Partial<FeedbackFormDraft>,
): FeedbackFormDraft => ({
  type: 'GENERAL',
  message: '',
  additionalContext: '',
  allowContact: false,
  contactEmail: authenticatedEmail?.trim() ?? '',
  companyWebsite: '',
  ...draft,
});

const getCurrentPath = (fallback?: string): string => (
  typeof window !== 'undefined' ? window.location.pathname : fallback || '/feedback'
);

type FeedbackValidationErrors = {
  message: string | null;
  email: string | null;
};

const emptyFeedbackValidationErrors: FeedbackValidationErrors = {
  message: null,
  email: null,
};

const validateFeedbackForm = (form: FeedbackFormDraft): FeedbackValidationErrors | null => {
  const messageLength = form.message.trim().length;
  if (messageLength < 10) {
    return {
      message: 'Your feedback must contain at least 10 characters.',
      email: null,
    };
  }
  if (messageLength > 5000) {
    return {
      message: 'Your feedback must be 5,000 characters or fewer.',
      email: null,
    };
  }
  if (form.allowContact && !form.contactEmail.trim()) {
    return {
      message: null,
      email: 'Enter an email address or turn off contact permission.',
    };
  }
  return null;
};

const getClientContext = (): CreateFeedbackRequest['clientContext'] => ({
  surface: 'WEB',
  viewportWidth: typeof window !== 'undefined' ? window.innerWidth : undefined,
  viewportHeight: typeof window !== 'undefined' ? window.innerHeight : undefined,
});

const createFeedbackInput = (
  form: FeedbackFormDraft,
  currentPagePath?: string,
): CreateFeedbackRequest => {
  const sourcePath = getCurrentPath(currentPagePath);
  const additionalContext = form.type === 'GENERAL'
    ? {}
    : { additionalContext: form.additionalContext };

  return {
    type: form.type,
    message: form.message,
    ...additionalContext,
    allowContact: form.allowContact,
    contactEmail: form.allowContact ? form.contactEmail : undefined,
    sourcePath,
    clientContext: getClientContext(),
    companyWebsite: form.companyWebsite,
  };
};

const getSubmissionErrorMessage = (submissionError: unknown): string => (
  submissionError instanceof Error
    ? submissionError.message
    : 'We could not send your feedback. Please try again.'
);

function useAuthenticatedEmailPrefill({
  authenticatedEmail,
  form,
  onDraftChange,
  setForm,
  contactEmailTouchedRef,
}: {
  authenticatedEmail?: string | null;
  form: FeedbackFormDraft;
  onDraftChange?: (draft: FeedbackFormDraft) => void;
  setForm: (nextForm: FeedbackFormDraft) => void;
  contactEmailTouchedRef: React.MutableRefObject<boolean>;
}) {
  useEffect(() => {
    const nextEmail = authenticatedEmail?.trim();
    if (!nextEmail || contactEmailTouchedRef.current) return;

    if (form.contactEmail.trim()) {
      contactEmailTouchedRef.current = true;
      return;
    }

    const next = { ...form, contactEmail: nextEmail };
    contactEmailTouchedRef.current = true;
    setForm(next);
    onDraftChange?.(next);
  }, [authenticatedEmail, contactEmailTouchedRef, form, onDraftChange, setForm]);
}

function FeedbackTypeField({
  value,
  labelId,
  onChange,
}: {
  value: FeedbackSubmissionType;
  labelId: string;
  onChange: (value: FeedbackSubmissionType) => void;
}) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend id={labelId} className="text-sm font-medium text-foreground">
        What kind of feedback is this?
      </legend>
      <RadioGroup
        name="feedbackType"
        value={value}
        onValueChange={onChange}
        aria-labelledby={labelId}
        required
        className="grid grid-cols-1 gap-2 sm:grid-cols-3"
      >
        {feedbackTypeOptions.map((option) => {
          const optionId = `${labelId}-${option.value.toLowerCase()}`;
          return (
            <label
              key={option.value}
              htmlFor={optionId}
              className="flex min-h-11 items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm text-foreground hover:bg-muted/50"
            >
              <RadioGroupItem id={optionId} value={option.value} />
              <span>{option.label}</span>
            </label>
          );
        })}
      </RadioGroup>
    </fieldset>
  );
}

function FeedbackMessageField({
  message,
  messageId,
  messageError,
  messageErrorId,
  onChange,
}: {
  message: string;
  messageId: string;
  messageError: string | null;
  messageErrorId: string;
  onChange: (value: string) => void;
}) {
  return (
    <Field>
      <FieldLabel htmlFor={messageId}>Your feedback</FieldLabel>
      <Textarea
        id={messageId}
        placeholder="Tell us what happened or what you would like to see."
        value={message}
        onChange={(event) => onChange(event.currentTarget.value)}
        rows={6}
        maxLength={5000}
        aria-required="true"
        aria-invalid={messageError ? true : undefined}
        aria-describedby={messageError ? messageErrorId : undefined}
      />
      {messageError ? <FieldError id={messageErrorId}>{messageError}</FieldError> : null}
    </Field>
  );
}

function FeedbackContextField({
  type,
  context,
  contextId,
  onChange,
}: {
  type: FeedbackSubmissionType;
  context: string;
  contextId: string;
  onChange: (value: string) => void;
}) {
  const contextLabel = feedbackContextLabels[type] ?? null;
  if (!contextLabel) return null;

  return (
    <Field>
      <FieldLabel htmlFor={contextId}>{contextLabel}</FieldLabel>
      <Textarea
        id={contextId}
        value={context}
        onChange={(event) => onChange(event.currentTarget.value)}
        rows={3}
        maxLength={2000}
      />
    </Field>
  );
}

function FeedbackContactField({
  allowContact,
  contactEmail,
  contactEmailId,
  emailError,
  emailErrorId,
  onChange,
}: {
  allowContact: boolean;
  contactEmail: string;
  contactEmailId: string;
  emailError: string | null;
  emailErrorId: string;
  onChange: (value: string) => void;
}) {
  if (!allowContact) return null;

  return (
    <Field>
      <FieldLabel htmlFor={contactEmailId}>Email address</FieldLabel>
      <Input
        id={contactEmailId}
        type="email"
        value={contactEmail}
        onChange={(event) => onChange(event.currentTarget.value)}
        maxLength={254}
        aria-required="true"
        aria-invalid={emailError ? true : undefined}
        aria-describedby={emailError ? emailErrorId : undefined}
      />
      {emailError ? <FieldError id={emailErrorId}>{emailError}</FieldError> : null}
    </Field>
  );
}

function FeedbackActions({
  submitting,
  onCancel,
}: {
  submitting: boolean;
  onCancel?: () => void;
}) {
  return (
    <div className="flex flex-wrap justify-end gap-2">
      {onCancel ? (
        <Button type="button" variant="outline" onClick={onCancel} disabled={submitting}>
          Cancel
        </Button>
      ) : null}
      <Button type="submit" disabled={submitting} aria-label={submitting ? 'Send feedback' : undefined}>
        {submitting ? 'Sending feedback…' : 'Send feedback'}
      </Button>
    </div>
  );
}

function FeedbackFields({
  form,
  messageError,
  messageErrorId,
  emailError,
  emailErrorId,
  feedbackTypeLabelId,
  messageId,
  contextId,
  allowContactId,
  contactEmailId,
  companyWebsiteId,
  submitting,
  onUpdate,
  onTypeChange,
  onCancel,
}: {
  form: FeedbackFormDraft;
  messageError: string | null;
  messageErrorId: string;
  emailError: string | null;
  emailErrorId: string;
  feedbackTypeLabelId: string;
  messageId: string;
  contextId: string;
  allowContactId: string;
  contactEmailId: string;
  companyWebsiteId: string;
  submitting: boolean;
  onUpdate: FeedbackDraftUpdater;
  onTypeChange: (value: FeedbackSubmissionType) => void;
  onCancel?: () => void;
}) {
  return (
    <>
      <FeedbackTypeField
        value={form.type}
        labelId={feedbackTypeLabelId}
        onChange={onTypeChange}
      />

      <FeedbackMessageField
        message={form.message}
        messageId={messageId}
        messageError={messageError}
        messageErrorId={messageErrorId}
        onChange={(value) => onUpdate('message', value)}
      />

      <FeedbackContextField
        type={form.type}
        context={form.additionalContext}
        contextId={contextId}
        onChange={(value) => onUpdate('additionalContext', value)}
      />

      <Field orientation="horizontal" className="items-center">
        <Checkbox
          id={allowContactId}
          checked={form.allowContact}
          onCheckedChange={(checked) => onUpdate('allowContact', checked)}
        />
        <FieldLabel htmlFor={allowContactId} className="font-normal">
          You may contact me about this feedback
        </FieldLabel>
      </Field>

      <FeedbackContactField
        allowContact={form.allowContact}
        contactEmail={form.contactEmail}
        contactEmailId={contactEmailId}
        emailError={emailError}
        emailErrorId={emailErrorId}
        onChange={(value) => onUpdate('contactEmail', value)}
      />

      <div aria-hidden="true" className="sr-only">
        <label htmlFor={companyWebsiteId}>Company website</label>
        <Input
          id={companyWebsiteId}
          tabIndex={-1}
          name="companyWebsite"
          autoComplete="off"
          aria-label="Company website"
          value={form.companyWebsite}
          onChange={(event) => onUpdate('companyWebsite', event.currentTarget.value)}
        />
      </div>

      <FeedbackActions submitting={submitting} onCancel={onCancel} />
    </>
  );
}

function FeedbackSuccess({
  response,
  onDone,
  onCancel,
  onSendAnother,
}: {
  response: CreateFeedbackResponse;
  onDone?: () => void;
  onCancel?: () => void;
  onSendAnother: () => void;
}) {
  const [copied, setCopied] = useState(false);

  return (
    <div className="flex flex-col gap-4" data-testid="feedback-confirmation">
      <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 text-sm text-foreground" role="status">
        <p className="font-medium">Feedback received</p>
        <p className="mt-1">
          Thank you. Your feedback was saved and will help us improve BracketIQ.
        </p>
      </div>
      <Card size="sm">
        <CardContent className="flex flex-col gap-2">
          <p className="text-xs text-muted-foreground">Confirmation identifier</p>
          <div className="flex min-w-0 items-center gap-2">
            <p className="min-w-0 flex-1 break-all font-mono text-sm text-foreground">
              {response.submission.id}
            </p>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="Copy confirmation identifier"
              onClick={() => {
                void navigator.clipboard?.writeText(response.submission.id);
                setCopied(true);
              }}
            >
              {copied ? <Check size={15} aria-hidden="true" /> : <Copy size={15} aria-hidden="true" />}
            </Button>
          </div>
        </CardContent>
      </Card>
      <div className="flex flex-wrap justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            onDone?.();
            onCancel?.();
          }}
        >
          Done
        </Button>
        <Button type="button" onClick={onSendAnother}>
          Send another
        </Button>
      </div>
    </div>
  );
}

export function FeedbackForm({
  currentPagePath,
  authenticatedEmail,
  entrySource,
  draft,
  onDraftChange,
  onSuccess,
  onCancel,
  onDone,
}: FeedbackFormProps) {
  const [form, setForm] = useState<FeedbackFormDraft>(() => initialFormState(authenticatedEmail, draft));
  const [submitting, setSubmitting] = useState(false);
  const [validationErrors, setValidationErrors] = useState<FeedbackValidationErrors>(
    emptyFeedbackValidationErrors,
  );
  const [formError, setFormError] = useState<string | null>(null);
  const [success, setSuccess] = useState<CreateFeedbackResponse | null>(null);
  const feedbackTypeLabelId = useId();
  const messageId = useId();
  const contextId = useId();
  const allowContactId = useId();
  const contactEmailId = useId();
  const companyWebsiteId = useId();
  const messageErrorId = useId();
  const emailErrorId = useId();
  const formErrorId = useId();
  const contactEmailTouchedRef = useRef(Boolean(draft?.contactEmail?.trim()));

  useAuthenticatedEmailPrefill({
    authenticatedEmail,
    form,
    onDraftChange,
    setForm,
    contactEmailTouchedRef,
  });

  const updateForm: FeedbackDraftUpdater = (key, value) => {
    if (key === 'contactEmail') contactEmailTouchedRef.current = true;
    const next = { ...form, [key]: value };
    setForm(next);
    onDraftChange?.(next);
  };

  const updateFeedbackType = (nextType: FeedbackSubmissionType) => {
    const next = {
      ...form,
      type: nextType,
      ...(nextType === 'GENERAL' ? { additionalContext: '' } : {}),
    };
    setForm(next);
    onDraftChange?.(next);
  };

  const resetForAnother = () => {
    const next = initialFormState(authenticatedEmail);
    contactEmailTouchedRef.current = false;
    setForm(next);
    onDraftChange?.(next);
    setValidationErrors(emptyFeedbackValidationErrors);
    setFormError(null);
    setSuccess(null);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setValidationErrors(emptyFeedbackValidationErrors);
    setFormError(null);

    const validationErrors = validateFeedbackForm(form);
    if (validationErrors) {
      setValidationErrors(validationErrors);
      return;
    }

    const input = createFeedbackInput(form, currentPagePath);
    setSubmitting(true);
    try {
      const response = await createFeedbackSubmission(input);
      setSuccess(response);
      trackFeedbackSubmitted({
        type: form.type,
        allowContact: form.allowContact,
        pathCategory: normalizeFeedbackPathCategory(input.sourcePath ?? ''),
      });
      onSuccess?.(response);
    } catch (submissionError) {
      setFormError(getSubmissionErrorMessage(submissionError));
    } finally {
      setSubmitting(false);
    }
  };

  if (success) {
    return (
      <FeedbackSuccess
        response={success}
        onDone={onDone}
        onCancel={onCancel}
        onSendAnother={resetForAnother}
      />
    );
  }

  return (
    <form onSubmit={(event) => { void handleSubmit(event); }}>
      <div className="flex flex-col gap-4">
        {formError ? <FieldError id={formErrorId}>{formError}</FieldError> : null}
        <FeedbackFields
          form={form}
          messageError={validationErrors.message}
          messageErrorId={messageErrorId}
          emailError={validationErrors.email}
          emailErrorId={emailErrorId}
          feedbackTypeLabelId={feedbackTypeLabelId}
          messageId={messageId}
          contextId={contextId}
          allowContactId={allowContactId}
          contactEmailId={contactEmailId}
          companyWebsiteId={companyWebsiteId}
          submitting={submitting}
          onUpdate={updateForm}
          onTypeChange={updateFeedbackType}
          onCancel={onCancel}
        />
      </div>
    </form>
  );
}

export default FeedbackForm;
