import { describe, expect, it } from 'vitest';
import { proformaInvalidMessage } from './proformaStatus';

describe('proformaInvalidMessage', () => {
  it('keeps active documents valid and marks both terminal states invalid', () => {
    expect(proformaInvalidMessage('active')).toBeNull();
    expect(proformaInvalidMessage('expired')).toContain('به پایان رسیده');
    expect(proformaInvalidMessage('cancelled')).toContain('باطل شده');
  });
});
