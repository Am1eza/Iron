import { describe, expect, it } from 'vitest';
import { LEAD_STATUSES } from '@/lib/server/db/schema/leads';
import { checkLeadStatusChange, LEAD_STATUS_TRANSITIONS, type LeadStatus } from './leadStatusFlow';

const ALL = LEAD_STATUSES as readonly LeadStatus[];
const REASON = 'مشتری بعد از ثبت سفارش منصرف شد';

describe('checkLeadStatusChange', () => {
  it('allows every no-op, so a double click is never a 409', () => {
    for (const s of ALL) {
      expect(checkLeadStatusChange({ from: s, to: s })).toBeNull();
    }
  });

  it('refuses every move back to "new" — the status that means «never contacted»', () => {
    for (const from of ALL.filter((s) => s !== 'new')) {
      const rejection = checkLeadStatusChange({ from, to: 'new', reason: REASON });
      expect(rejection?.error, `${from} -> new`).toBe('status_transition_invalid');
      expect(rejection?.httpStatus).toBe(409);
    }
  });

  it('refuses un-contacting a lead', () => {
    expect(checkLeadStatusChange({ from: 'contacted', to: 'new' })?.error).toBe('status_transition_invalid');
  });

  it('lets a deal close from anywhere it is still open', () => {
    expect(checkLeadStatusChange({ from: 'new', to: 'won' })).toBeNull();
    expect(checkLeadStatusChange({ from: 'new', to: 'lost' })).toBeNull();
    expect(checkLeadStatusChange({ from: 'new', to: 'contacted' })).toBeNull();
    expect(checkLeadStatusChange({ from: 'contacted', to: 'won' })).toBeNull();
    expect(checkLeadStatusChange({ from: 'contacted', to: 'lost' })).toBeNull();
  });

  it('reopens a lost lead with no ceremony — it understates nothing', () => {
    expect(checkLeadStatusChange({ from: 'lost', to: 'contacted' })).toBeNull();
    expect(checkLeadStatusChange({ from: 'lost', to: 'won' })).toBeNull();
  });

  it('demands a reason for every way out of "won"', () => {
    for (const to of LEAD_STATUS_TRANSITIONS.won) {
      expect(checkLeadStatusChange({ from: 'won', to })?.error, `won -> ${to}`).toBe('status_reason_required');
      expect(checkLeadStatusChange({ from: 'won', to, reason: REASON }), `won -> ${to} with reason`).toBeNull();
    }
  });

  it('does not accept whitespace or a single character as a reason', () => {
    expect(checkLeadStatusChange({ from: 'won', to: 'lost', reason: '   ' })?.error).toBe('status_reason_required');
    expect(checkLeadStatusChange({ from: 'won', to: 'lost', reason: 'x' })?.error).toBe('status_reason_required');
    expect(checkLeadStatusChange({ from: 'won', to: 'lost', reason: null })?.error).toBe('status_reason_required');
  });

  it('reports the illegal transition before asking for a reason', () => {
    // 'won' -> 'new' is both illegal AND reason-gated. The rep must be told the
    // move is impossible, not sent off to write a justification for it.
    expect(checkLeadStatusChange({ from: 'won', to: 'new' })?.error).toBe('status_transition_invalid');
  });

  it('never demands a reason on a path the admin UI offers without one', () => {
    // Every button in LeadDetail/MyDesk that flips status without collecting
    // text: new/contacted -> won|lost, and «بازگشایی» out of lost.
    const uiPaths: Array<[LeadStatus, LeadStatus]> = [
      ['new', 'contacted'],
      ['new', 'won'],
      ['new', 'lost'],
      ['contacted', 'won'],
      ['contacted', 'lost'],
      ['lost', 'contacted'],
    ];
    for (const [from, to] of uiPaths) {
      expect(checkLeadStatusChange({ from, to }), `${from} -> ${to}`).toBeNull();
    }
  });

  it('keeps the transition table exhaustive over the schema enum', () => {
    expect(Object.keys(LEAD_STATUS_TRANSITIONS).sort()).toEqual([...ALL].sort());
    for (const targets of Object.values(LEAD_STATUS_TRANSITIONS)) {
      for (const t of targets) expect(ALL).toContain(t);
    }
  });
});
