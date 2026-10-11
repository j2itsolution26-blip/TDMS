import { describe, expect, it } from 'vitest';
import { announcementSchema, inventoryItemSchema, purchaseSchema, purchaseStatusSchema } from './supplies';

describe('inventoryItemSchema', () => {
  const valid = { category: 'CSS_NC2', name: 'Crimping tool', quantityGood: '10', quantityDefective: 0 };
  it('accepts whole, non-negative counts', () => {
    expect(inventoryItemSchema.parse(valid)).toMatchObject({ quantityGood: 10, quantityDefective: 0, unit: null, remarks: null });
  });
  it('refuses negative or fractional counts and unknown categories', () => {
    expect(inventoryItemSchema.safeParse({ ...valid, quantityGood: -1 }).success).toBe(false);
    expect(inventoryItemSchema.safeParse({ ...valid, quantityDefective: 1.5 }).success).toBe(false);
    expect(inventoryItemSchema.safeParse({ ...valid, category: 'WELDING' }).success).toBe(false);
  });
});

describe('purchaseSchema', () => {
  it('needs at least one unit', () => {
    expect(purchaseSchema.safeParse({ category: 'OFFICE_SUPPLY', itemName: 'Bond paper', quantity: 0 }).success).toBe(false);
    expect(purchaseSchema.safeParse({ category: 'OFFICE_SUPPLY', itemName: 'Bond paper', quantity: 5 }).success).toBe(true);
  });
  it('accepts only the known statuses', () => {
    expect(purchaseStatusSchema.safeParse({ status: 'DELIVERED' }).success).toBe(true);
    expect(purchaseStatusSchema.safeParse({ status: 'PAID' }).success).toBe(false);
  });
});

describe('announcementSchema', () => {
  it('takes an audience and an optional course', () => {
    expect(announcementSchema.parse({ title: 'Exam week', body: 'See the calendar.', audience: 'BOTH', programId: '' })).toMatchObject({ programId: null });
    expect(announcementSchema.parse({ title: 'Exam week', body: 'x', audience: 'STUDENTS', programId: '4' }).programId).toBe(4n);
    expect(announcementSchema.safeParse({ title: 'Exam week', body: 'x', audience: 'PARENTS' }).success).toBe(false);
    expect(announcementSchema.safeParse({ title: '', body: 'x', audience: 'BOTH' }).success).toBe(false);
  });
});
