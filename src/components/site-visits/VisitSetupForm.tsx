import { ArrowLeft, CalendarDays, MapPin, Play, Save, UserRound } from 'lucide-react'
import { useState, type FormEvent, type ReactNode } from 'react'
import {
  isValidPhone,
  lookupJohorPostcode,
  normalizePhone,
  type Client,
  type VisitFormValue,
} from '../../lib/siteVisit'

type Props = {
  initialValue: VisitFormValue
  clients: Client[]
  editing: boolean
  onCancel: () => void
  onSubmit: (value: VisitFormValue) => Promise<void>
}

export function VisitSetupForm({ initialValue, clients, editing, onCancel, onSubmit }: Props) {
  const [form, setForm] = useState(initialValue)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [postcodeNotice, setPostcodeNotice] = useState('')

  function update<K extends keyof VisitFormValue>(key: K, value: VisitFormValue[K]) {
    setForm((current) => ({ ...current, [key]: value }))
  }

  function updatePhone(value: string) {
    update('client_phone', value)
    const normalized = normalizePhone(value)
    const existingClient = clients.find((client) => client.phone_normalized === normalized)
    if (existingClient) update('client_name', existingClient.name)
  }

  function updatePostcode(value: string) {
    const postcode = value.replace(/\D/g, '').slice(0, 5)
    update('postcode', postcode)
    const suggestion = lookupJohorPostcode(postcode)
    if (suggestion) {
      setForm((current) => ({ ...current, postcode, ...suggestion }))
      setPostcodeNotice(`Cadangan automatik: ${suggestion.city}, ${suggestion.state}. Masih boleh diubah.`)
    } else {
      setPostcodeNotice('')
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')

    if (!form.client_name.trim()) {
      setError('Masukkan nama pelanggan.')
      return
    }
    if (!isValidPhone(form.client_phone)) {
      setError('Masukkan nombor telefon pelanggan yang sah.')
      return
    }
    if (!form.project_title.trim() || !form.visit_date) {
      setError('Tajuk projek dan tarikh lawatan mesti diisi.')
      return
    }
    if (!form.address_line_1.trim() || !form.city.trim() || !form.state.trim()) {
      setError('Lengkapkan alamat utama, bandar dan negeri projek.')
      return
    }

    try {
      setSaving(true)
      await onSubmit(form)
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Lawatan tidak dapat disimpan.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <header className="flex items-start gap-3">
        <button type="button" onClick={onCancel} className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-slate-200 bg-white text-slate-700" aria-label="Kembali">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div>
          <p className="text-sm font-bold text-amber-700">{editing ? 'Kemas kini lawatan' : 'Lawatan baharu'}</p>
          <h1 className="mt-1 text-2xl font-black tracking-tight">Maklumat tapak</h1>
          <p className="mt-2 text-sm leading-6 text-slate-600">Isi maklumat asas sekali sahaja. Harga tidak diperlukan ketika lawatan.</p>
        </div>
      </header>

      {error && <p role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">{error}</p>}

      <FormSection icon={<UserRound />} title="Pelanggan" description="Pelanggan lama akan dikenal pasti melalui nombor telefon.">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nama pelanggan" required value={form.client_name} onChange={(value) => update('client_name', value)} placeholder="Contoh: Encik Ahmad" />
          <Field label="No. telefon" required type="tel" value={form.client_phone} onChange={updatePhone} placeholder="01X-XXXXXXX" list="client-phones" />
          <datalist id="client-phones">
            {clients.filter((client) => client.is_active).map((client) => <option key={client.id} value={client.phone}>{client.name}</option>)}
          </datalist>
        </div>
      </FormSection>

      <FormSection icon={<CalendarDays />} title="Tujuan lawatan" description="Tajuk telah disediakan tetapi boleh diubah mengikut kerja.">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2"><Field label="Tajuk projek" required value={form.project_title} onChange={(value) => update('project_title', value)} /></div>
          <Field label="Tarikh lawatan" required type="date" value={form.visit_date} onChange={(value) => update('visit_date', value)} />
        </div>
      </FormSection>

      <FormSection icon={<MapPin />} title="Alamat projek" description="Alamat projek berasingan daripada alamat pelanggan.">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2"><Field label="Alamat baris 1" required value={form.address_line_1} onChange={(value) => update('address_line_1', value)} placeholder="No. rumah dan nama jalan" /></div>
          <div className="sm:col-span-2"><Field label="Alamat baris 2" value={form.address_line_2} onChange={(value) => update('address_line_2', value)} placeholder="Taman / kampung" /></div>
          <div>
            <Field label="Poskod" inputMode="numeric" value={form.postcode} onChange={updatePostcode} placeholder="85000" />
            {postcodeNotice && <p className="mt-1.5 text-xs font-medium leading-5 text-emerald-700">{postcodeNotice}</p>}
          </div>
          <Field label="Bandar / kawasan" required value={form.city} onChange={(value) => update('city', value)} />
          <Field label="Negeri" required value={form.state} onChange={(value) => update('state', value)} />
        </div>
      </FormSection>

      <div className="sticky bottom-20 z-10 rounded-2xl border border-slate-200 bg-white/95 p-3 shadow-xl shadow-slate-300/60 backdrop-blur lg:bottom-4">
        <button type="submit" disabled={saving} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-slate-950 px-5 text-sm font-black text-white hover:bg-slate-800 disabled:opacity-60 sm:ml-auto sm:w-auto">
          {editing ? <Save className="h-5 w-5" /> : <Play className="h-5 w-5" />}
          {saving ? 'Menyimpan...' : editing ? 'Simpan Perubahan' : 'Mula Lawatan'}
        </button>
      </div>
    </form>
  )
}

function FormSection({ icon, title, description, children }: { icon: ReactNode; title: string; description: string; children: ReactNode }) {
  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="mb-5 flex gap-3">
        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-amber-100 text-amber-800 [&>svg]:h-5 [&>svg]:w-5">{icon}</div>
        <div>
          <h2 className="font-black">{title}</h2>
          <p className="mt-1 text-xs leading-5 text-slate-500">{description}</p>
        </div>
      </div>
      {children}
    </section>
  )
}

function Field({ label, value, onChange, required = false, type = 'text', inputMode, placeholder, list }: { label: string; value: string; onChange: (value: string) => void; required?: boolean; type?: string; inputMode?: 'text' | 'numeric' | 'tel'; placeholder?: string; list?: string }) {
  return (
    <label className="block">
      <span className="field-label">{label}{required && <span className="ml-1 text-red-600">*</span>}</span>
      <input type={type} inputMode={inputMode} required={required} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} list={list} className="field-control" />
    </label>
  )
}
