import { z } from 'zod';
import { idSchema } from './schemas';
import { ANNOUNCEMENT_AUDIENCES, PURCHASE_STATUSES, SUPPLY_CATEGORIES } from '@shared/lib/supplies';

/** Validation for Assessment Center supplies and Director announcements. */

const optionalText = (max: number) =>
  z.string().trim().max(max).nullish().transform((v) => (v ? v : null));
const category = z.enum(SUPPLY_CATEGORIES, { errorMap: () => ({ message: 'Choose a qualification or supply category.' }) });
const count = (label: string) => z.coerce.number({ invalid_type_error: `Enter ${label}.` }).int(`${label} must be a whole number.`).min(0, `${label} cannot be negative.`).max(1_000_000);

export const inventoryItemSchema = z.object({
  category,
  name: z.string().trim().min(1, 'Enter the item name.').max(255),
  unit: optionalText(40),
  quantityGood: count('Good quantity'),
  quantityDefective: count('Defective quantity'),
  remarks: optionalText(1000),
});
export type InventoryItemInput = z.infer<typeof inventoryItemSchema>;

export const purchaseSchema = z.object({
  category,
  itemName: z.string().trim().min(1, 'Enter what is being purchased.').max(255),
  quantity: z.coerce.number({ invalid_type_error: 'Enter the quantity.' }).int('Quantity must be a whole number.').min(1, 'Quantity must be at least 1.').max(1_000_000),
  unit: optionalText(40),
  remarks: optionalText(1000),
});
export type PurchaseInput = z.infer<typeof purchaseSchema>;

export const purchaseStatusSchema = z.object({
  status: z.enum(PURCHASE_STATUSES, { errorMap: () => ({ message: 'Choose a status.' }) }),
  remarks: optionalText(1000),
});

export const supplyFilterSchema = z.object({
  category: z.union([category, z.literal('')]).optional().transform((v) => (v ? v : undefined)),
  status: z.union([z.enum(PURCHASE_STATUSES), z.literal('')]).optional().transform((v) => (v ? v : undefined)),
});

export const announcementSchema = z.object({
  title: z.string().trim().min(1, 'Enter a title.').max(255),
  body: z.string().trim().min(1, 'Write the announcement.').max(5000),
  audience: z.enum(ANNOUNCEMENT_AUDIENCES, { errorMap: () => ({ message: 'Choose who receives it.' }) }),
  /** One course only; empty for everyone in the audience. */
  programId: z.union([idSchema, z.literal(''), z.null()]).optional().transform((v) => (v === '' || v === undefined ? null : v)),
});
export type AnnouncementInput = z.infer<typeof announcementSchema>;
