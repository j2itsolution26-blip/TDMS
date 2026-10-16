import { describe, expect, it } from 'vitest';
import { canDismiss, presentDetails, singleFlight } from './confirm';

function deferred() {
  let resolve!: (v: boolean) => void;
  const promise = new Promise<boolean>((r) => { resolve = r; });
  return { promise, resolve };
}

describe('singleFlight', () => {
  it('runs the action once however often Confirm is pressed while it is in flight', async () => {
    let calls = 0;
    const d = deferred();
    const confirm = singleFlight(() => { calls += 1; return d.promise; });
    const first = confirm();
    const second = confirm();
    const third = confirm();
    d.resolve(true);
    expect(await first).toBe('succeeded');
    expect(await second).toBe('ignored');
    expect(await third).toBe('ignored');
    expect(calls).toBe(1);
  });

  it('allows a fresh attempt once the previous one has settled', async () => {
    let calls = 0;
    const confirm = singleFlight(async () => { calls += 1; return calls > 1; });
    expect(await confirm()).toBe('failed');
    expect(await confirm()).toBe('succeeded');
    expect(calls).toBe(2);
  });

  it('treats false as failed and a thrown error as failed, never as done', async () => {
    expect(await singleFlight(async () => false)()).toBe('failed');
    expect(await singleFlight(async () => { throw new Error('network'); })()).toBe('failed');
  });

  it('releases the guard after a throw', async () => {
    let calls = 0;
    const confirm = singleFlight(async () => { calls += 1; if (calls === 1) throw new Error('x'); return true; });
    await confirm();
    expect(await confirm()).toBe('succeeded');
  });
});

describe('canDismiss', () => {
  it('blocks dismissal only while the action is pending', () => {
    expect(canDismiss(false)).toBe(true);
    expect(canDismiss(true)).toBe(false);
  });
});

describe('presentDetails', () => {
  it('drops empty values instead of rendering blank rows', () => {
    expect(presentDetails([
      { label: 'Student', value: ' Ana Cruz ' },
      { label: 'Section', value: null },
      { label: 'Program', value: '' },
      { label: 'Semester', value: 1 },
      { label: 'Venue', value: undefined },
    ])).toEqual([{ label: 'Student', value: 'Ana Cruz' }, { label: 'Semester', value: '1' }]);
  });

  it('accepts no details at all', () => {
    expect(presentDetails(undefined)).toEqual([]);
  });
});
