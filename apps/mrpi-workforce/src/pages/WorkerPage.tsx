import { ArrowRight, FileText, Pencil, Plus, UserRoundCheck, Users } from 'lucide-react'
import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link } from 'wouter'
import { useAuth } from '../auth/AuthProvider'
import { PageHeader } from '../components/PageHeader'
import { EmptyBlock, ErrorBlock, LoadingBlock } from '../components/State'
import { errorMessage } from '../lib/errors'
import { loadCompany, loadWorkers } from '../lib/queries'
import { supabase } from '../lib/supabase'
import { formatMoney, payTypeLabel } from '../lib/workforce'
import type { Company, PayType, Worker } from '../types/domain'

export function WorkerPage() {
  const { user } = useAuth()
  const [company, setCompany] = useState<Company | null>(null)
  const [rows, setRows] = useState<Worker[]>([])
  const [editing, setEditing] = useState<Worker | null>(null)
  const [open, setOpen] = useState(false)
  const [payType, setPayType] = useState<PayType>('daily')
  const [isCrewLeader, setIsCrewLeader] = useState(false)
  const [crewLeaderId, setCrewLeaderId] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const refresh = () => {
    setLoading(true)
    Promise.all([loadCompany(), loadWorkers()])
      .then(([loadedCompany, workers]) => {
        setCompany(loadedCompany)
        setRows(workers)
      })
      .catch((reason: unknown) => setError(errorMessage(reason)))
      .finally(() => setLoading(false))
  }

  useEffect(refresh, [])

  const workerMap = useMemo(() => new Map(rows.map((worker) => [worker.id, worker])), [rows])
  const memberCounts = useMemo(() => {
    const counts = new Map<number, number>()
    rows.forEach((worker) => {
      if (!worker.crew_leader_id) return
      counts.set(worker.crew_leader_id, (counts.get(worker.crew_leader_id) ?? 0) + 1)
    })
    return counts
  }, [rows])
  const leaderOptions = rows.filter((worker) => worker.is_crew_leader && worker.id !== editing?.id)

  function begin(worker: Worker | null) {
    setEditing(worker)
    setPayType(worker?.pay_type ?? 'daily')
    setIsCrewLeader(worker?.is_crew_leader ?? false)
    setCrewLeaderId(worker?.crew_leader_id ? String(worker.crew_leader_id) : '')
    setOpen(true)
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!supabase || !company || !user) return
    const form = new FormData(event.currentTarget)
    const rate = Number(form.get('default_daily_rate') || 0)
    const payload = {
      name: String(form.get('name') || '').trim(),
      pay_type: payType,
      default_daily_rate: payType === 'daily' ? rate : null,
      notes: String(form.get('notes') || ''),
      is_active: form.get('is_active') === 'on',
      is_crew_leader: isCrewLeader,
      crew_leader_id: isCrewLeader || !crewLeaderId ? null : Number(crewLeaderId),
    }
    setSaving(true)
    setError('')
    try {
      if (editing) {
        const { error: updateError } = await supabase.from('workers').update(payload).eq('id', editing.id)
        if (updateError) throw updateError
      } else {
        const { error: insertError } = await supabase.from('workers').insert({ ...payload, company_id: company.id, owner_user_id: user.id })
        if (insertError) throw insertError
      }
      setOpen(false)
      setEditing(null)
      refresh()
    } catch (reason) {
      setError(errorMessage(reason))
    } finally {
      setSaving(false)
    }
  }

  return <>
    <PageHeader
      eyebrow="Nama sahaja"
      title="Pekerja"
      description="Buka report individu untuk semak attendance, projek, upah, bayaran dan advance setiap pekerja."
      action={<button className="btn-primary" onClick={() => begin(null)}><Plus className="h-4 w-4" />Tambah pekerja</button>}
    />
    {error && <div className="mb-4"><ErrorBlock message={error} /></div>}
    {open && <form onSubmit={save} className="card mb-5 grid gap-4 p-5 md:grid-cols-2">
      <div className="md:col-span-2"><h2 className="text-lg font-black">{editing ? 'Kemaskini pekerja' : 'Pekerja baharu'}</h2></div>
      <label><span className="field-label">Nama pekerja</span><input name="name" className="field-control" required defaultValue={editing?.name} /></label>
      <label><span className="field-label">Jenis bayaran</span><select className="field-control" value={payType} onChange={(event) => setPayType(event.target.value as PayType)}><option value="daily">Gaji hari</option><option value="contract">Kontrak</option></select></label>
      {payType === 'daily' && <label><span className="field-label">Kadar sehari</span><input name="default_daily_rate" type="number" min="0" step="0.01" className="field-control" required defaultValue={editing?.default_daily_rate ?? ''} placeholder="RM" /></label>}
      <label className={payType === 'contract' ? 'md:col-span-2' : ''}><span className="field-label">Catatan</span><input name="notes" className="field-control" defaultValue={editing?.notes} /></label>

      <div className="rounded-2xl border border-sky-100 bg-sky-50 p-4 md:col-span-2">
        <label className="flex items-center gap-3 text-sm font-black text-slate-900">
          <input
            type="checkbox"
            checked={isCrewLeader}
            onChange={(event) => {
              setIsCrewLeader(event.target.checked)
              if (event.target.checked) setCrewLeaderId('')
            }}
            className="h-5 w-5 accent-sky-600"
          />
          <Users className="h-4 w-4 text-sky-700" />
          Jadikan Kepala Tukang
        </label>
        <p className="mt-2 text-xs leading-5 text-slate-500">Kepala Tukang boleh menerima bayaran gaji bagi pekerja yang diletakkan di bawahnya.</p>
        {!isCrewLeader && <label className="mt-4 block">
          <span className="field-label">Bawah kepala tukang</span>
          <select className="field-control" value={crewLeaderId} onChange={(event) => setCrewLeaderId(event.target.value)}>
            <option value="">Tiada · bayar terus kepada pekerja</option>
            {leaderOptions.map((leader) => <option key={leader.id} value={leader.id}>{leader.name}</option>)}
          </select>
          {!leaderOptions.length && <span className="mt-1 block text-[11px] text-slate-500">Belum ada Kepala Tukang. Tandakan seorang pekerja sebagai Kepala Tukang dahulu.</span>}
        </label>}
      </div>

      <label className="flex items-center gap-3 text-sm font-bold"><input type="checkbox" name="is_active" defaultChecked={editing?.is_active ?? true} className="h-5 w-5 accent-sky-600" />Masih aktif</label>
      <div className="flex justify-end gap-2"><button type="button" className="btn-secondary" onClick={() => setOpen(false)}>Batal</button><button className="btn-primary" disabled={saving}>{saving ? 'Menyimpan...' : 'Simpan'}</button></div>
    </form>}
    {loading
      ? <LoadingBlock />
      : !rows.length
        ? <EmptyBlock title="Belum ada pekerja" description="Tambah nama pekerja pertama untuk mula merekod attendance." />
        : <div className="grid gap-3 md:grid-cols-2">{rows.map((worker) => {
          const leader = worker.crew_leader_id ? workerMap.get(worker.crew_leader_id) : undefined
          const memberCount = memberCounts.get(worker.id) ?? 0
          return <article key={worker.id} className="card flex items-start gap-4 p-5">
            <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${worker.is_crew_leader ? 'bg-violet-50 text-violet-700' : 'bg-sky-50 text-sky-700'}`}><UserRoundCheck className="h-5 w-5" /></span>
            <div className="min-w-0 flex-1">
              <div className="flex justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-black">{worker.name}</h2>
                    {worker.is_crew_leader && <span className="rounded-full bg-violet-100 px-2 py-1 text-[10px] font-black text-violet-700">KEPALA TUKANG</span>}
                  </div>
                  <p className="mt-1 text-sm text-slate-500">{payTypeLabel(worker.pay_type)}{worker.pay_type === 'daily' ? ` · ${formatMoney(worker.default_daily_rate)}/hari` : ''}</p>
                  {worker.is_crew_leader && <p className="mt-1 text-xs font-bold text-violet-700">{memberCount} pekerja bawahannya</p>}
                  {!worker.is_crew_leader && leader && <p className="mt-1 text-xs font-bold text-sky-700">Gaji melalui {leader.name}</p>}
                </div>
                <button onClick={() => begin(worker)} aria-label={`Edit ${worker.name}`} className="grid h-10 w-10 place-items-center rounded-xl text-slate-500 hover:bg-slate-100"><Pencil className="h-4 w-4" /></button>
              </div>
              {worker.notes && <p className="mt-3 text-xs leading-5 text-slate-500">{worker.notes}</p>}
              {!worker.is_active && <span className="mt-3 inline-flex rounded-full bg-slate-100 px-2 py-1 text-[10px] font-black text-slate-500">Tidak aktif</span>}
              <Link href={`/workers/${worker.id}/report`} className="mt-4 flex min-h-11 items-center justify-between rounded-xl border border-sky-100 bg-sky-50 px-3.5 text-sm font-black text-sky-800 hover:bg-sky-100"><span className="inline-flex items-center gap-2"><FileText className="h-4 w-4" />Buka report</span><ArrowRight className="h-4 w-4" /></Link>
            </div>
          </article>
        })}</div>}
  </>
}
