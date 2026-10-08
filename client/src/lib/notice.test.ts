import { describe, it, expect } from 'vitest';
import { succeeded, undelivered } from './notice';

describe('notice tone', () => {
  it('marks a delivery failure as a warning, never a success', () => {
    expect(undelivered('Could not send the email').tone).toBe('warning');
    expect(undelivered('Could not send the email', 'The provider refused.').tone).toBe('warning');
  });

  it('marks a confirmation as a success', () => {
    expect(succeeded('Invitation sent').tone).toBe('success');
  });
});

describe('notice punctuation', () => {
  it('does not double the provider detail’s own full stop', () => {
    const detail =
      'The mail provider is in testing mode and will only deliver to the address that owns the provider account.';
    const { text } = undelivered('Could not send the email', detail);

    expect(text).toBe(`Could not send the email — ${detail}`);
    expect(text.endsWith('..')).toBe(false);
  });

  it('adds a full stop when the detail has none', () => {
    expect(undelivered('Could not send the email', 'connection refused').text).toBe(
      'Could not send the email — connection refused.',
    );
  });

  it('keeps other terminal punctuation as it is', () => {
    expect(undelivered('Could not send the email', 'Is the host reachable?').text).toBe(
      'Could not send the email — Is the host reachable?',
    );
  });

  it('closes the lead when there is no detail', () => {
    expect(undelivered('Could not send the email').text).toBe('Could not send the email.');
  });

  it('ignores whitespace around the detail', () => {
    expect(undelivered('Could not send the email', '  Rate limited.  ').text).toBe(
      'Could not send the email — Rate limited.',
    );
  });

  it('leaves an empty detail out of the sentence', () => {
    expect(undelivered('Could not send the email', '   ').text).toBe('Could not send the email.');
  });
});
