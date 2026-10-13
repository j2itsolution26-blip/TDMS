import { Prisma } from '@prisma/client';
import { prisma } from '@/server/lib/prisma';
import { AppError, NotFoundError } from '@/server/lib/http';
import type { AuthUser } from '@shared/types/domain';
import { FINAL_PURCHASE_STATUSES, PURCHASE_STATUS_LABELS, SUPPLY_CATEGORIES, SUPPLY_CATEGORY_LABELS, inventoryTotals, type PurchaseStatus, type SupplyCategory } from '@shared/lib/supplies';
import { recordAudit, actorLabel, type AuditContext } from './audit-log';
import type { InventoryItemInput, PurchaseInput } from '@/server/schemas/supplies';

/**
 * Assessment Center supplies: inventory (good / defective counts with
 * remarks) and purchases with a status, both per qualification or supply
 * category. Every change is audited with its before and after values.
 *
 * Deliberately not linked: marking a purchase Delivered does not change the
 * inventory, because the document does not say that it should — the Manager
 * updates the counts after checking what arrived.
 */

const actorId = (u: AuthUser) => BigInt(u.id);
const label = (c: string) => SUPPLY_CATEGORY_LABELS[c as SupplyCategory] ?? c;

function itemView(i: Prisma.InventoryItemGetPayload<object>) {
  return {
    id: i.id.toString(),
    category: i.category as SupplyCategory,
    categoryLabel: label(i.category),
    name: i.name,
    unit: i.unit,
    quantityGood: i.quantityGood,
    quantityDefective: i.quantityDefective,
    onHand: i.quantityGood + i.quantityDefective,
    remarks: i.remarks,
    updatedAt: i.updatedAt.toISOString(),
  };
}

function purchaseView(p: Prisma.PurchaseRequestGetPayload<object>) {
  return {
    id: p.id.toString(),
    category: p.category as SupplyCategory,
    categoryLabel: label(p.category),
    itemName: p.itemName,
    quantity: p.quantity,
    unit: p.unit,
    status: p.status as PurchaseStatus,
    remarks: p.remarks,
    statusChangedAt: p.statusChangedAt.toISOString(),
    createdAt: p.createdAt.toISOString(),
  };
}

function duplicateName(error: unknown): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
    throw new AppError('That item is already in this category.', 422, { name: ['That item is already listed under this category.'] });
  }
  throw error;
}

// --- Inventory -------------------------------------------------------------------------

export async function listInventory(category?: SupplyCategory) {
  const rows = await prisma.inventoryItem.findMany({ where: category ? { category } : {}, orderBy: [{ category: 'asc' }, { name: 'asc' }] });
  const items = rows.map(itemView);
  const byCategory = SUPPLY_CATEGORIES.map((c) => ({ category: c, label: SUPPLY_CATEGORY_LABELS[c], ...inventoryTotals(items.filter((i) => i.category === c)) }));
  return { items, totals: inventoryTotals(items), byCategory };
}

export async function createInventoryItem(input: InventoryItemInput, user: AuthUser, context: AuditContext) {
  const row = await prisma.inventoryItem.create({ data: { ...input, createdBy: actorId(user), updatedBy: actorId(user) } }).catch(duplicateName);
  await recordAudit({
    action: 'INVENTORY_ITEM_CREATED',
    actor: actorLabel(user),
    target: `Inventory: ${row.name} (${label(row.category)})`,
    details: { item_id: row.id.toString(), good: row.quantityGood, defective: row.quantityDefective },
    context,
  });
  return itemView(row);
}

export async function updateInventoryItem(id: bigint, input: InventoryItemInput, user: AuthUser, context: AuditContext) {
  const before = await prisma.inventoryItem.findUnique({ where: { id } });
  if (!before) throw new NotFoundError('That inventory item does not exist.');
  const row = await prisma.inventoryItem.update({ where: { id }, data: { ...input, updatedBy: actorId(user) } }).catch(duplicateName);
  await recordAudit({
    action: 'INVENTORY_ITEM_UPDATED',
    actor: actorLabel(user),
    target: `Inventory: ${row.name} (${label(row.category)})`,
    details: {
      item_id: id.toString(),
      before: { name: before.name, category: before.category, good: before.quantityGood, defective: before.quantityDefective, remarks: before.remarks },
      after: { name: row.name, category: row.category, good: row.quantityGood, defective: row.quantityDefective, remarks: row.remarks },
    },
    context,
  });
  return itemView(row);
}

export async function deleteInventoryItem(id: bigint, user: AuthUser, context: AuditContext) {
  const before = await prisma.inventoryItem.findUnique({ where: { id } });
  if (!before) throw new NotFoundError('That inventory item does not exist.');
  await prisma.inventoryItem.delete({ where: { id } });
  await recordAudit({
    action: 'INVENTORY_ITEM_DELETED',
    actor: actorLabel(user),
    target: `Inventory: ${before.name} (${label(before.category)})`,
    details: { item_id: id.toString(), good: before.quantityGood, defective: before.quantityDefective, remarks: before.remarks },
    context,
  });
}

// --- Purchases -------------------------------------------------------------------------

export async function listPurchases(filters: { category?: SupplyCategory; status?: PurchaseStatus }) {
  const rows = await prisma.purchaseRequest.findMany({
    where: { ...(filters.category ? { category: filters.category } : {}), ...(filters.status ? { status: filters.status } : {}) },
    orderBy: [{ createdAt: 'desc' }],
    take: 500,
  });
  const counts = await prisma.purchaseRequest.groupBy({ by: ['status'], _count: { _all: true } });
  return {
    purchases: rows.map(purchaseView),
    byStatus: Object.fromEntries(counts.map((c) => [c.status, c._count._all])) as Partial<Record<PurchaseStatus, number>>,
  };
}

export async function createPurchase(input: PurchaseInput, user: AuthUser, context: AuditContext) {
  const row = await prisma.purchaseRequest.create({ data: { ...input, status: 'REQUESTED', createdBy: actorId(user), updatedBy: actorId(user) } });
  await recordAudit({
    action: 'PURCHASE_CREATED',
    actor: actorLabel(user),
    target: `Purchase: ${row.itemName} (${label(row.category)})`,
    details: { purchase_id: row.id.toString(), quantity: row.quantity, unit: row.unit },
    context,
  });
  return purchaseView(row);
}

/** Edit the details of a purchase that is not yet final. */
export async function updatePurchase(id: bigint, input: PurchaseInput, user: AuthUser, context: AuditContext) {
  const before = await prisma.purchaseRequest.findUnique({ where: { id } });
  if (!before) throw new NotFoundError('That purchase does not exist.');
  if (FINAL_PURCHASE_STATUSES.includes(before.status as PurchaseStatus)) {
    throw new AppError(`This purchase is ${PURCHASE_STATUS_LABELS[before.status as PurchaseStatus].toLowerCase()} and can no longer be edited.`, 409);
  }
  const done = await prisma.purchaseRequest.updateMany({ where: { id, status: before.status }, data: { ...input, updatedBy: actorId(user) } });
  if (done.count !== 1) throw new AppError('This purchase was changed by someone else. Reload and try again.', 409);
  const row = (await prisma.purchaseRequest.findUnique({ where: { id } }))!;
  await recordAudit({
    action: 'PURCHASE_UPDATED',
    actor: actorLabel(user),
    target: `Purchase: ${row.itemName} (${label(row.category)})`,
    details: { purchase_id: id.toString(), before: { item: before.itemName, quantity: before.quantity, category: before.category }, after: { item: row.itemName, quantity: row.quantity, category: row.category } },
    context,
  });
  return purchaseView(row);
}

/** Move a purchase to another status. Delivered and Cancelled are final. */
export async function setPurchaseStatus(id: bigint, status: PurchaseStatus, remarks: string | null, user: AuthUser, context: AuditContext) {
  const before = await prisma.purchaseRequest.findUnique({ where: { id } });
  if (!before) throw new NotFoundError('That purchase does not exist.');
  if (FINAL_PURCHASE_STATUSES.includes(before.status as PurchaseStatus)) {
    throw new AppError(`This purchase is already ${PURCHASE_STATUS_LABELS[before.status as PurchaseStatus].toLowerCase()}.`, 409);
  }
  if (before.status === status) throw new AppError(`This purchase is already ${PURCHASE_STATUS_LABELS[status].toLowerCase()}.`, 422, { status: ['Choose a different status.'] });

  const done = await prisma.purchaseRequest.updateMany({
    where: { id, status: before.status },
    data: { status, statusChangedAt: new Date(), updatedBy: actorId(user), ...(remarks !== null ? { remarks } : {}) },
  });
  if (done.count !== 1) throw new AppError('This purchase was changed by someone else. Reload and try again.', 409);

  await recordAudit({
    action: 'PURCHASE_STATUS_CHANGED',
    actor: actorLabel(user),
    target: `Purchase: ${before.itemName} (${label(before.category)})`,
    details: { purchase_id: id.toString(), from: before.status, to: status, remarks },
    context,
  });
  return purchaseView((await prisma.purchaseRequest.findUnique({ where: { id } }))!);
}

/** The inventory and purchase figures shown on the Director's, Admin's and Manager's dashboards. */
export async function suppliesSummary() {
  const [items, open] = await Promise.all([
    prisma.inventoryItem.findMany({ select: { category: true, quantityGood: true, quantityDefective: true } }),
    prisma.purchaseRequest.count({ where: { status: { notIn: [...FINAL_PURCHASE_STATUSES] } } }),
  ]);
  return {
    inventory: inventoryTotals(items),
    defectiveItems: items.filter((i) => i.quantityDefective > 0).length,
    openPurchases: open,
  };
}
