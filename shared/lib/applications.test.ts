import { describe, expect, it } from 'vitest';
import {
  applicationNumber, approvalProblems, canTransition, documentProgress, firstProblemStep,
  isEditable, isHandedIn, statusesFor, submissionProblems, type RequirementState,
} from './applications';

const complete = {
  firstName: 'Ana', lastName: 'Cruz', dateOfBirth: '2005-03-01', email: 'ana@example.com', phone: '0917 123 4567',
  address: 'Purok 1, Dagupan City', programId: '1', schoolYearId: '1', highestEducation: 'senior_high', previousSchool: 'Dagupan NHS',
};
const req = (id: string, isRequired: boolean, status: string): RequirementState => ({ id, name: `Doc ${id}`, isRequired, status });

describe('transitions', () => {
  it('a draft or returned application can be submitted', () => {
    expect(canTransition('draft', 'submit')).toBe(true);
    expect(canTransition('returned', 'submit')).toBe(true);
    expect(canTransition('submitted', 'submit')).toBe(false);
  });
  it('only submitted or under-review applications can be decided', () => {
    for (const action of ['approve', 'return', 'reject'] as const) {
      expect(canTransition('submitted', action)).toBe(true);
      expect(canTransition('under_review', action)).toBe(true);
      expect(canTransition('draft', action)).toBe(false);
      expect(canTransition('approved', action)).toBe(false);
      expect(canTransition('rejected', action)).toBe(false);
    }
  });
  it('a decision cannot be repeated: approved and rejected are final', () => {
    expect(canTransition('approved', 'approve')).toBe(false);
    expect(isEditable('approved')).toBe(false);
    expect(isEditable('rejected')).toBe(false);
    expect(isEditable('returned')).toBe(true);
  });
  it('review starts from submitted only', () => {
    expect(statusesFor('start_review')).toEqual(['submitted']);
  });
});

describe('submissionProblems', () => {
  it('a complete application with its documents handed in has none', () => {
    expect(submissionProblems(complete, [req('1', true, 'submitted'), req('2', true, 'verified'), req('3', false, 'pending')])).toEqual({});
  });
  it('names every missing field and required document; optional documents never block', () => {
    const p = submissionProblems({ ...complete, address: '  ', previousSchool: null }, [req('1', true, 'pending'), req('2', true, 'rejected'), req('3', false, 'pending')]);
    expect(Object.keys(p).sort()).toEqual(['address', 'documents.1', 'documents.2', 'previousSchool']);
  });
  it('sends the user to the earliest step with a problem', () => {
    expect(firstProblemStep({ previousSchool: ['x'], 'documents.1': ['y'] })).toBe(2);
    expect(firstProblemStep({ 'documents.1': ['y'] })).toBe(3);
    expect(firstProblemStep({ email: ['x'], previousSchool: ['y'] })).toBe(1);
    expect(firstProblemStep({})).toBeNull();
  });
});

describe('documents', () => {
  it('an upload is handed in but not verified', () => {
    expect(isHandedIn('submitted')).toBe(true);
    expect(approvalProblems([req('1', true, 'submitted')])).toEqual(['Doc 1 is not verified yet.']);
  });
  it('approval needs every required document verified, optional ones never', () => {
    expect(approvalProblems([req('1', true, 'verified'), req('2', false, 'pending')])).toEqual([]);
  });
  it('progress counts handed-in and verified documents out of all that apply', () => {
    expect(documentProgress([req('1', true, 'verified'), req('2', true, 'submitted'), req('3', false, 'pending'), req('4', true, 'rejected')]))
      .toEqual({ handedIn: 2, verified: 1, total: 4 });
  });
});

describe('applicationNumber', () => {
  it('is APP-<year>-<id padded to 4>', () => {
    expect(applicationNumber(new Date('2026-10-18T00:00:00'), 7n)).toBe('APP-2026-0007');
    expect(applicationNumber(new Date('2026-10-18T00:00:00'), 12345)).toBe('APP-2026-12345');
  });
});
