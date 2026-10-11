/**
 * Assessment Center supplies: the categories inventory and purchases are
 * kept under, and the purchase statuses.
 *
 * The categories are the list in the function and role document, in its
 * order. They are validated here, not by a database constraint, so adding a
 * qualification is a code change without a migration.
 */
export const SUPPLY_CATEGORIES = ['CSS_NC2', 'EVENTS_NC3', 'FRONT_OFFICE_NC2', 'FNB_NC2', 'CAREGIVING', 'COOKERY_NC2', 'OFFICE_SUPPLY'] as const;
export type SupplyCategory = (typeof SUPPLY_CATEGORIES)[number];

export const SUPPLY_CATEGORY_LABELS: Record<SupplyCategory, string> = {
  CSS_NC2: 'CSS NC II',
  EVENTS_NC3: 'Event Management NC III',
  FRONT_OFFICE_NC2: 'Front Office NC II',
  FNB_NC2: 'Food and Beverage NC II',
  CAREGIVING: 'Caregiving',
  COOKERY_NC2: 'Cookery NC II',
  OFFICE_SUPPLY: 'Office supply',
};

/**
 * Where a purchase stands. DELIVERED and CANCELLED are final. The document
 * asks for "status of purchase" without naming the steps; these are an
 * assumption recorded in docs/pdf-requirements-traceability.md.
 */
export const PURCHASE_STATUSES = ['REQUESTED', 'APPROVED', 'ORDERED', 'DELIVERED', 'CANCELLED'] as const;
export type PurchaseStatus = (typeof PURCHASE_STATUSES)[number];

export const PURCHASE_STATUS_LABELS: Record<PurchaseStatus, string> = {
  REQUESTED: 'Requested',
  APPROVED: 'Approved',
  ORDERED: 'Ordered',
  DELIVERED: 'Delivered',
  CANCELLED: 'Cancelled',
};

export const FINAL_PURCHASE_STATUSES: readonly PurchaseStatus[] = ['DELIVERED', 'CANCELLED'];

/** Inventory totals for a set of items: on hand = good + defective. */
export function inventoryTotals(items: { quantityGood: number; quantityDefective: number }[]) {
  const good = items.reduce((n, i) => n + i.quantityGood, 0);
  const defective = items.reduce((n, i) => n + i.quantityDefective, 0);
  return { items: items.length, good, defective, onHand: good + defective };
}

// --- Announcements ---------------------------------------------------------------

export const ANNOUNCEMENT_AUDIENCES = ['INSTRUCTORS', 'STUDENTS', 'BOTH'] as const;
export type AnnouncementAudience = (typeof ANNOUNCEMENT_AUDIENCES)[number];

export const ANNOUNCEMENT_AUDIENCE_LABELS: Record<AnnouncementAudience, string> = {
  INSTRUCTORS: 'Instructors',
  STUDENTS: 'Students',
  BOTH: 'Instructors and students',
};
