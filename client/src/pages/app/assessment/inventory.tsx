import { useState } from 'react';
import { Plus } from 'lucide-react';
import Modal from '@/components/Modal';
import { Page } from '@/lib/page-data';
import { api } from '@/lib/api-client';
import { useRouter } from '@/lib/navigation';
import { useAction } from '@/components/teaching/client-kit';
import { BTN, BTN_DANGER, BTN_SECONDARY, BTN_SMALL, Card, Empty, Field, Flash, INPUT, PageShell, Stat, TD, TH, Table } from '@/components/teaching/kit';
import { SUPPLY_CATEGORIES, SUPPLY_CATEGORY_LABELS, type SupplyCategory } from '@shared/lib/supplies';
import { withQuery } from '@/components/assessment/parts';
import type { loadInventory } from '@/server/controllers/pages/app/supplies';

type Data = Awaited<ReturnType<typeof loadInventory>>;
type Item = Data['items'][number];

function ItemForm({ item, category, onDone }: { item: Item | null; category: SupplyCategory | null; onDone: () => void }) {
  const { busy, error, errors, run } = useAction();
  const [f, setF] = useState({
    category: item?.category ?? category ?? '',
    name: item?.name ?? '',
    unit: item?.unit ?? '',
    quantityGood: String(item?.quantityGood ?? 0),
    quantityDefective: String(item?.quantityDefective ?? 0),
    remarks: item?.remarks ?? '',
  });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  async function save(e: React.FormEvent) {
    e.preventDefault();
    const body = { ...f, unit: f.unit || null, remarks: f.remarks || null };
    if (await run(() => (item ? api.put(`/api/v1/assessment/inventory/${item.id}`, body) : api.post('/api/v1/assessment/inventory', body)))) onDone();
  }
  async function remove() {
    if (!item || !window.confirm(`Remove "${item.name}" from the inventory? The removal is recorded in the audit log.`)) return;
    if (await run(() => api.del(`/api/v1/assessment/inventory/${item.id}`))) onDone();
  }
  return (
    <form className="space-y-4" onSubmit={save} noValidate>
      <Field label="Qualification / category" htmlFor="i-cat" error={errors.category}>
        <select id="i-cat" className={INPUT} value={f.category} onChange={set('category')} required>
          <option value="">Choose…</option>
          {SUPPLY_CATEGORIES.map((c) => <option key={c} value={c}>{SUPPLY_CATEGORY_LABELS[c]}</option>)}
        </select>
      </Field>
      <div className="grid gap-4 sm:grid-cols-[1fr_10rem]">
        <Field label="Item" htmlFor="i-name" error={errors.name}><input id="i-name" className={INPUT} value={f.name} onChange={set('name')} maxLength={255} required /></Field>
        <Field label="Unit" htmlFor="i-unit" error={errors.unit} hint="pcs, sets, boxes…"><input id="i-unit" className={INPUT} value={f.unit} onChange={set('unit')} maxLength={40} /></Field>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Good" htmlFor="i-good" error={errors.quantityGood}><input id="i-good" type="number" min={0} step={1} className={INPUT} value={f.quantityGood} onChange={set('quantityGood')} required /></Field>
        <Field label="Defective" htmlFor="i-bad" error={errors.quantityDefective}><input id="i-bad" type="number" min={0} step={1} className={INPUT} value={f.quantityDefective} onChange={set('quantityDefective')} required /></Field>
      </div>
      <p className="text-xs text-tdms-muted">Quantity on hand: <b className="tabular-nums">{(Number(f.quantityGood) || 0) + (Number(f.quantityDefective) || 0)}</b> (good + defective)</p>
      <Field label="Remarks" htmlFor="i-remarks" error={errors.remarks}><textarea id="i-remarks" rows={2} className={INPUT} value={f.remarks} onChange={set('remarks')} maxLength={1000} /></Field>
      {error && !Object.keys(errors).length && <Flash kind="error">{error}</Flash>}
      <div className="flex justify-between gap-2">
        <div>{item && <button type="button" className={BTN_DANGER} disabled={busy} onClick={remove}>Remove</button>}</div>
        <div className="flex gap-2"><button type="button" className={BTN_SECONDARY} onClick={onDone}>Cancel</button><button type="submit" className={BTN} disabled={busy}>Save</button></div>
      </div>
    </form>
  );
}

function View(d: Data) {
  const router = useRouter();
  const [editing, setEditing] = useState<Item | 'new' | null>(null);
  return (
    <PageShell
      eyebrow="Assessment Center"
      title="Inventory"
      description="Tools, equipment and supplies per qualification, counted as good or defective. Every change is recorded in the audit log."
      actions={d.canManage && <button type="button" className={BTN} onClick={() => setEditing('new')}><Plus className="h-4 w-4" aria-hidden="true" /> Add item</button>}
    >
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Items" value={d.totals.items} />
        <Stat label="On hand" value={d.totals.onHand} />
        <Stat label="Good" value={d.totals.good} tone="success" />
        <Stat label="Defective" value={d.totals.defective} tone={d.totals.defective ? 'failed' : undefined} />
      </div>

      <Card
        padded={false}
        title={d.category ? SUPPLY_CATEGORY_LABELS[d.category] : 'All categories'}
        actions={
          <>
            <label htmlFor="inv-cat" className="sr-only">Category</label>
            <select id="inv-cat" className={`${INPUT} w-auto`} value={d.category ?? ''} onChange={(e) => router.push(withQuery('/assessment/inventory', { category: e.target.value }))}>
              <option value="">All categories</option>
              {d.byCategory.map((c) => <option key={c.category} value={c.category}>{c.label} ({c.items})</option>)}
            </select>
          </>
        }
      >
        {d.items.length === 0 ? (
          <div className="p-6"><Empty title="No inventory items yet" description={d.canManage ? 'Add the tools and supplies for each qualification.' : undefined} /></div>
        ) : (
          <Table label="Inventory" head={<><th className={TH}>Category</th><th className={TH}>Item</th><th className={`${TH} text-right`}>Good</th><th className={`${TH} text-right`}>Defective</th><th className={`${TH} text-right`}>On hand</th><th className={TH}>Remarks</th><th className={TH}><span className="sr-only">Actions</span></th></>}>
            {d.items.map((i) => (
              <tr key={i.id}>
                <td className={TD}>{i.categoryLabel}</td>
                <td className={TD}><span className="font-semibold">{i.name}</span>{i.unit && <span className="text-tdms-muted"> · {i.unit}</span>}</td>
                <td className={`${TD} text-right tabular-nums`}>{i.quantityGood}</td>
                <td className={`${TD} text-right tabular-nums ${i.quantityDefective ? 'font-semibold text-red-700' : ''}`}>{i.quantityDefective}</td>
                <td className={`${TD} text-right font-semibold tabular-nums`}>{i.onHand}</td>
                <td className={`${TD} max-w-[18rem] text-[13px] text-tdms-muted`}>{i.remarks}</td>
                <td className={`${TD} text-right`}>{d.canManage && <button type="button" className={BTN_SMALL} onClick={() => setEditing(i)}>Edit</button>}</td>
              </tr>
            ))}
          </Table>
        )}
      </Card>

      <Modal open={editing !== null} onClose={() => setEditing(null)} title={editing === 'new' ? 'Add inventory item' : 'Edit inventory item'}>
        {editing !== null && <ItemForm item={editing === 'new' ? null : editing} category={d.category} onDone={() => setEditing(null)} />}
      </Modal>
    </PageShell>
  );
}

/** /assessment/inventory */
export default function InventoryPage() {
  return <Page<Data> endpoint="/assessment/inventory" render={(d) => <View {...d} />} />;
}
