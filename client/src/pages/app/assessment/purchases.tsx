import { useState } from 'react';
import { Plus } from 'lucide-react';
import Modal from '@/components/Modal';
import { Page } from '@/lib/page-data';
import { api } from '@/lib/api-client';
import { useRouter } from '@/lib/navigation';
import { useAction } from '@/components/teaching/client-kit';
import { BTN, BTN_SECONDARY, BTN_SMALL, Card, Empty, Field, Flash, INPUT, PageShell, StatusPill, TD, TH, Table } from '@/components/teaching/kit';
import { FINAL_PURCHASE_STATUSES, PURCHASE_STATUSES, PURCHASE_STATUS_LABELS, SUPPLY_CATEGORIES, SUPPLY_CATEGORY_LABELS, type PurchaseStatus, type SupplyCategory } from '@shared/lib/supplies';
import type { WorkTone } from '@shared/types/dashboard';
import { withQuery } from '@/components/assessment/parts';
import type { loadPurchases } from '@/server/controllers/pages/app/supplies';

type Data = Awaited<ReturnType<typeof loadPurchases>>;
type Purchase = Data['purchases'][number];

const TONE: Record<PurchaseStatus, WorkTone> = { REQUESTED: 'attention', APPROVED: 'info', ORDERED: 'info', DELIVERED: 'success', CANCELLED: 'neutral' };

function PurchaseForm({ p, category, onDone }: { p: Purchase | null; category: SupplyCategory | null; onDone: () => void }) {
  const { busy, error, errors, run } = useAction();
  const [f, setF] = useState({ category: p?.category ?? category ?? '', itemName: p?.itemName ?? '', quantity: String(p?.quantity ?? 1), unit: p?.unit ?? '', remarks: p?.remarks ?? '' });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  async function save(e: React.FormEvent) {
    e.preventDefault();
    const body = { ...f, unit: f.unit || null, remarks: f.remarks || null };
    if (await run(() => (p ? api.put(`/api/v1/assessment/purchases/${p.id}`, body) : api.post('/api/v1/assessment/purchases', body)))) onDone();
  }
  return (
    <form className="space-y-4" onSubmit={save} noValidate>
      <Field label="Qualification / category" htmlFor="p-cat" error={errors.category}>
        <select id="p-cat" className={INPUT} value={f.category} onChange={set('category')} required>
          <option value="">Choose…</option>
          {SUPPLY_CATEGORIES.map((c) => <option key={c} value={c}>{SUPPLY_CATEGORY_LABELS[c]}</option>)}
        </select>
      </Field>
      <Field label="Item" htmlFor="p-item" error={errors.itemName}><input id="p-item" className={INPUT} value={f.itemName} onChange={set('itemName')} maxLength={255} required /></Field>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Quantity" htmlFor="p-qty" error={errors.quantity}><input id="p-qty" type="number" min={1} step={1} className={INPUT} value={f.quantity} onChange={set('quantity')} required /></Field>
        <Field label="Unit" htmlFor="p-unit" error={errors.unit}><input id="p-unit" className={INPUT} value={f.unit} onChange={set('unit')} maxLength={40} /></Field>
      </div>
      <Field label="Remarks" htmlFor="p-remarks" error={errors.remarks}><textarea id="p-remarks" rows={2} className={INPUT} value={f.remarks} onChange={set('remarks')} maxLength={1000} /></Field>
      {error && !Object.keys(errors).length && <Flash kind="error">{error}</Flash>}
      <div className="flex justify-end gap-2"><button type="button" className={BTN_SECONDARY} onClick={onDone}>Cancel</button><button type="submit" className={BTN} disabled={busy}>Save</button></div>
    </form>
  );
}

function StatusForm({ p, onDone }: { p: Purchase; onDone: () => void }) {
  const { busy, error, errors, run } = useAction();
  const next = PURCHASE_STATUSES.filter((s) => s !== p.status);
  const [status, setStatus] = useState<PurchaseStatus>(next[0]!);
  const [remarks, setRemarks] = useState('');
  const final = FINAL_PURCHASE_STATUSES.includes(status);
  return (
    <form className="space-y-4" onSubmit={async (e) => { e.preventDefault(); if (await run(() => api.post(`/api/v1/assessment/purchases/${p.id}/status`, { status, remarks: remarks || null }))) onDone(); }}>
      <p className="text-sm">{p.itemName} · {p.quantity}{p.unit ? ` ${p.unit}` : ''} · now <b>{PURCHASE_STATUS_LABELS[p.status]}</b></p>
      <Field label="New status" htmlFor="ps-status" error={errors.status}>
        <select id="ps-status" className={INPUT} value={status} onChange={(e) => setStatus(e.target.value as PurchaseStatus)}>
          {next.map((s) => <option key={s} value={s}>{PURCHASE_STATUS_LABELS[s]}</option>)}
        </select>
      </Field>
      <Field label="Remarks (optional)" htmlFor="ps-remarks" error={errors.remarks}><textarea id="ps-remarks" rows={2} className={INPUT} value={remarks} onChange={(e) => setRemarks(e.target.value)} maxLength={1000} /></Field>
      {final && <Flash kind="info">{PURCHASE_STATUS_LABELS[status]} is final: the purchase can no longer be edited or moved. {status === 'DELIVERED' ? 'Update the inventory counts after checking what arrived.' : ''}</Flash>}
      {error && !Object.keys(errors).length && <Flash kind="error">{error}</Flash>}
      <div className="flex justify-end gap-2"><button type="button" className={BTN_SECONDARY} onClick={onDone}>Cancel</button><button type="submit" className={BTN} disabled={busy}>Update status</button></div>
    </form>
  );
}

type Dialog = { kind: 'new' } | { kind: 'edit'; p: Purchase } | { kind: 'status'; p: Purchase };

function View(d: Data) {
  const router = useRouter();
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const close = () => setDialog(null);
  const go = (values: Record<string, string | null>) => router.push(withQuery('/assessment/purchases', { category: d.category, status: d.status, ...values }));
  return (
    <PageShell
      eyebrow="Assessment Center"
      title="Purchases"
      description="Purchases per qualification and their status. Delivered and Cancelled are final. Every change is recorded in the audit log."
      actions={d.canManage && <button type="button" className={BTN} onClick={() => setDialog({ kind: 'new' })}><Plus className="h-4 w-4" aria-hidden="true" /> New purchase</button>}
    >
      <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by status">
        <button type="button" className={`${BTN_SMALL} ${!d.status ? 'border-tdms-text text-tdms-text' : ''}`} onClick={() => go({ status: null })}>All</button>
        {PURCHASE_STATUSES.map((s) => (
          <button key={s} type="button" aria-pressed={d.status === s} className={`${BTN_SMALL} ${d.status === s ? 'border-tdms-text text-tdms-text' : ''}`} onClick={() => go({ status: s })}>
            {PURCHASE_STATUS_LABELS[s]} <span className="tabular-nums text-tdms-muted">{d.byStatus[s] ?? 0}</span>
          </button>
        ))}
      </div>
      <Card
        padded={false}
        title={`${d.purchases.length} ${d.purchases.length === 1 ? 'purchase' : 'purchases'}`}
        actions={
          <>
            <label htmlFor="pur-cat" className="sr-only">Category</label>
            <select id="pur-cat" className={`${INPUT} w-auto`} value={d.category ?? ''} onChange={(e) => go({ category: e.target.value || null })}>
              <option value="">All categories</option>
              {SUPPLY_CATEGORIES.map((c) => <option key={c} value={c}>{SUPPLY_CATEGORY_LABELS[c]}</option>)}
            </select>
          </>
        }
      >
        {d.purchases.length === 0 ? (
          <div className="p-6"><Empty title="No purchases match" /></div>
        ) : (
          <Table label="Purchases" head={<><th className={TH}>Category</th><th className={TH}>Item</th><th className={`${TH} text-right`}>Qty</th><th className={TH}>Status</th><th className={TH}>Since</th><th className={TH}>Remarks</th><th className={TH}><span className="sr-only">Actions</span></th></>}>
            {d.purchases.map((p) => {
              const open = !FINAL_PURCHASE_STATUSES.includes(p.status);
              return (
                <tr key={p.id}>
                  <td className={TD}>{p.categoryLabel}</td>
                  <td className={`${TD} font-semibold`}>{p.itemName}</td>
                  <td className={`${TD} text-right tabular-nums`}>{p.quantity}{p.unit ? ` ${p.unit}` : ''}</td>
                  <td className={TD}><StatusPill label={PURCHASE_STATUS_LABELS[p.status]} tone={TONE[p.status]} /></td>
                  <td className={`${TD} tabular-nums text-[13px]`}>{new Date(p.statusChangedAt).toLocaleDateString()}</td>
                  <td className={`${TD} max-w-[18rem] text-[13px] text-tdms-muted`}>{p.remarks}</td>
                  <td className={`${TD} text-right`}>
                    {d.canManage && open && (
                      <div className="flex justify-end gap-1.5">
                        <button type="button" className={BTN_SMALL} onClick={() => setDialog({ kind: 'status', p })}>Status</button>
                        <button type="button" className={BTN_SMALL} onClick={() => setDialog({ kind: 'edit', p })}>Edit</button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </Table>
        )}
      </Card>

      <Modal open={dialog?.kind === 'new' || dialog?.kind === 'edit'} onClose={close} title={dialog?.kind === 'edit' ? 'Edit purchase' : 'New purchase'}>
        {(dialog?.kind === 'new' || dialog?.kind === 'edit') && <PurchaseForm p={dialog.kind === 'edit' ? dialog.p : null} category={d.category} onDone={close} />}
      </Modal>
      <Modal open={dialog?.kind === 'status'} onClose={close} title="Update purchase status">
        {dialog?.kind === 'status' && <StatusForm p={dialog.p} onDone={close} />}
      </Modal>
    </PageShell>
  );
}

/** /assessment/purchases */
export default function PurchasesPage() {
  return <Page<Data> endpoint="/assessment/purchases" render={(d) => <View {...d} />} />;
}
