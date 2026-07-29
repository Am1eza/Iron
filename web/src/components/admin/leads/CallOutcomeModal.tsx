'use client';
/**
 * «ثبت نتیجهٔ تماس» — replaces a blind "تماس گرفته شد" status flip with what
 * actually happened: answered, no answer, call back later (with a time), or
 * not interested. The point is reporting: without this, every lead the rep
 * ever calls looks identical in the timeline ("status → contacted"), so
 * nobody can later tell "we called and they said no" from "we never got
 * through" — the two have completely different next steps.
 *
 * Deliberately has NO opinion on what the caller does with the result: it
 * just resolves once with `{ outcome, note, callbackAt? }`, and the parent
 * (LeadDetail today) decides which of its own mutations to run — status,
 * callback, or handing off to the existing lost-reason flow for "declined".
 * That keeps this component reusable wherever a rep logs a call (میز کار من
 * is the obvious next place) without it owning any lead-mutation logic itself.
 */
import { useEffect, useState } from 'react';
import { Button, Modal } from '@/components/ui';
import { callbackPresets } from '@/lib/utils/callbackPresets';
import styles from './CallOutcomeModal.module.css';

export type CallOutcome = 'answered' | 'no_answer' | 'later' | 'declined';

const OUTCOME_META: Record<CallOutcome, { label: string; hint: string }> = {
  answered: { label: 'پاسخ داد', hint: 'مکالمه انجام شد' },
  no_answer: { label: 'پاسخ نداد', hint: 'تماس بی‌پاسخ ماند' },
  later: { label: 'بعداً تماس بگیرم', hint: 'زمان تماس بعدی را انتخاب کنید' },
  declined: { label: 'علاقه‌مند نبود', hint: 'به‌عنوان سرنخ ناموفق ثبت می‌شود' },
};

const OUTCOME_ORDER: CallOutcome[] = ['answered', 'no_answer', 'later', 'declined'];

export interface CallOutcomeResult {
  outcome: CallOutcome;
  /** Ready-to-save note text: «نتیجهٔ تماس: …» plus the rep's own words, if any. */
  note: string;
  /** ISO instant — present only when outcome === 'later'. */
  callbackAt?: string;
}

export function CallOutcomeModal({
  open,
  onClose,
  leadRef,
  contactName,
  busy = false,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  leadRef: string;
  contactName?: string | null;
  /** Disables the submit button while the parent's own mutation is in flight. */
  busy?: boolean;
  onSubmit: (result: CallOutcomeResult) => void;
}) {
  const [outcome, setOutcome] = useState<CallOutcome | null>(null);
  const [note, setNote] = useState('');
  const [callbackChoice, setCallbackChoice] = useState<{ label: string; at: Date } | null>(null);

  // Fresh state every time the modal opens — it may be a different lead than
  // last time, and a stray outcome/note from a cancelled attempt must never
  // silently ride along into this one.
  useEffect(() => {
    if (open) {
      setOutcome(null);
      setNote('');
      setCallbackChoice(null);
    }
  }, [open]);

  const presets = callbackPresets(new Date());
  const canSubmit = outcome !== null && (outcome !== 'later' || callbackChoice !== null);

  const submit = () => {
    if (!outcome || !canSubmit) return;
    const head = `نتیجهٔ تماس: ${OUTCOME_META[outcome].label}`;
    const trimmed = note.trim();
    onSubmit({
      outcome,
      note: trimmed ? `${head} — ${trimmed}` : head,
      callbackAt: outcome === 'later' ? callbackChoice!.at.toISOString() : undefined,
    });
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="ثبت نتیجهٔ تماس"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            انصراف
          </Button>
          <Button loading={busy} disabled={!canSubmit} onClick={submit}>
            ثبت نتیجه
          </Button>
        </>
      }
    >
      <p className={styles.subject}>
        تماس با {contactName?.trim() || 'مشتری'} · <bdi>{leadRef}</bdi>
      </p>

      <div className={styles.choices} role="radiogroup" aria-label="نتیجهٔ تماس">
        {OUTCOME_ORDER.map((o) => (
          <button
            key={o}
            type="button"
            role="radio"
            aria-checked={outcome === o}
            className={`${styles.choice} ${outcome === o ? styles.choiceSelected : ''}`}
            onClick={() => setOutcome(o)}
          >
            <span className={styles.choiceLabel}>{OUTCOME_META[o].label}</span>
            <span className={styles.choiceHint}>{OUTCOME_META[o].hint}</span>
          </button>
        ))}
      </div>

      {outcome === 'later' ? (
        <div className={styles.callbackRow}>
          <span className={styles.callbackLabel}>زمان تماس بعدی</span>
          <div className={styles.presets}>
            {presets.map((p) => (
              <Button
                key={p.label}
                type="button"
                size="sm"
                variant={callbackChoice?.label === p.label ? 'secondary' : 'ghost'}
                onClick={() => setCallbackChoice(p)}
              >
                {p.label}
              </Button>
            ))}
          </div>
        </div>
      ) : null}

      <label className={styles.noteLabel} htmlFor="call-outcome-note">
        توضیح کوتاه (اختیاری)
      </label>
      <textarea
        id="call-outcome-note"
        className={styles.textarea}
        placeholder="خلاصهٔ مکالمه، درخواست مشتری، مانع…"
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />
      {outcome === 'declined' ? (
        <p className={styles.declinedHint}>
          با ثبت این گزینه، پنجرهٔ «سرنخ ناموفق» باز می‌شود تا دلیل دقیق را انتخاب کنید.
        </p>
      ) : null}
    </Modal>
  );
}

/** So the caller's success toast can name what just happened without its own
 *  copy of the outcome→label map. */
export function outcomeLabel(outcome: CallOutcome): string {
  return OUTCOME_META[outcome].label;
}
