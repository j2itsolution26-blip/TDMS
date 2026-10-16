import { describe, expect, it } from 'vitest';
import { reviewOf } from './credential-documents';

describe('reviewOf', () => {
  it('maps a credential status to the verdict on its current document', () => {
    expect(reviewOf('verified')).toBe('verified');
    expect(reviewOf('rejected')).toBe('rejected');
    expect(reviewOf('submitted')).toBe('pending');
    expect(reviewOf('missing')).toBe('pending');
  });
});
