import { Building2, CheckCircle2, FileImage, Landmark, MapPin, PenTool, Save, ShieldCheck, Stamp, Trash2, Upload } from 'lucide-react'
import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { useAuth } from '../auth/AuthProvider'
import {
  buildCompanyAssetPath,
  companyAssetBucket,
  companyAssetLabel,
  validateCompanyAsset,
  type CompanyAssetKind,
} from '../lib/companyAssets'
import { supabase } from '../lib/supabase'
import type { Database } from '../types/database'

type CompanyRow = Database['public']['Tables']['companies']['Row']

type CompanyAssetPaths = {
  signature_path: string | null
  stamp_path: string | null
}

type CompanyAssetUrls = {
  signature: string | null
  stamp: string | null
}

type CompanyForm = {
  legal_name: string
  trading_name: string
  registration_no: string
  owner_name: string
  phone: string
  email: string
  website: string
  address_line_1: string
  address_line_2: string
  postcode: string
  city: string
  state: string
  business_description: string
  cidb_registration_no: string
  cidb_grade: string
  cidb_expiry_date: string
  mof_registration_no: string
  other_license_notes: string
  bank_name: string
  bank_account_name: string
  bank_account_no: string
}

const emptyForm: CompanyForm = {
  legal_name: '',
  trading_name: '',
  registration_no: '',
  owner_name: '',
  phone: '',
  email: '',
  website: '',
  address_line_1: '',
  address_line_2: '',
  postcode: '',
  city: '',
  state: 'Johor',
  business_description: '',
  cidb_registration_no: '',
  cidb_grade: '',
  cidb_expiry_date: '',
  mof_registration_no: '',
  other_license_notes: '',
  bank_name: '',
  bank_account_name: '',
  bank_account_no: '',
}

const emptyAssetPaths: CompanyAssetPaths = {
  signature_path: null,
  stamp_path: null,
}

const emptyAssetUrls: CompanyAssetUrls = {
  signature: null,
  stamp: null,
}

function toForm(row: CompanyRow): CompanyForm {
  return Object.fromEntries(
    Object.keys(emptyForm).map((key) => [key, row[key as keyof CompanyForm] ?? '']),
  ) as CompanyForm
}

function nullable(value: string) {
  const trimmed = value.trim()
  return trimmed || null
}

async function createAssetPreviewUrls(paths: CompanyAssetPaths) {
  if (!supabase) return emptyAssetUrls
  const requestedPaths = [paths.signature_path, paths.stamp_path].filter((path): path is string => Boolean(path))
  if (!requestedPaths.length) return emptyAssetUrls

  const { data, error } = await supabase.storage
    .from(companyAssetBucket)
    .createSignedUrls(requestedPaths, 60 * 60 * 6)
  if (error) throw error
  const urlByPath = new Map(data.map((item) => [item.path, item.signedUrl]))
  return {
    signature: paths.signature_path ? urlByPath.get(paths.signature_path) ?? null : null,
    stamp: paths.stamp_path ? urlByPath.get(paths.stamp_path) ?? null : null,
  }
}

export function CompanyProfilePage() {
  const [companyId, setCompanyId] = useState<number | null>(null)
  const [form, setForm] = useState<CompanyForm>(emptyForm)
  const [assetPaths, setAssetPaths] = useState<CompanyAssetPaths>(emptyAssetPaths)
  const [assetUrls, setAssetUrls] = useState<CompanyAssetUrls>(emptyAssetUrls)
  const [assetBusy, setAssetBusy] = useState<CompanyAssetKind | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const { user } = useAuth()

  useEffect(() => {
    if (!supabase || !user) return
    let mounted = true

    async function loadProfile() {
      const { data, error: loadError } = await supabase!
        .from('companies')
        .select('*')
        .eq('owner_user_id', user!.id)
        .maybeSingle()
      if (!mounted) return
      if (loadError) {
        setError(loadError.message)
      } else if (data) {
        const nextAssetPaths = {
          signature_path: data.signature_path,
          stamp_path: data.stamp_path,
        }
        setCompanyId(data.id)
        setForm(toForm(data))
        setAssetPaths(nextAssetPaths)
        try {
          const previewUrls = await createAssetPreviewUrls(nextAssetPaths)
          if (mounted) setAssetUrls(previewUrls)
        } catch (previewError) {
          if (mounted) setError(previewError instanceof Error ? previewError.message : 'Pratonton aset syarikat tidak dapat dibuka.')
        }
      } else {
        setForm((current) => ({ ...current, email: user!.email ?? '' }))
      }
      if (mounted) setLoading(false)
    }

    void loadProfile()

    return () => {
      mounted = false
    }
  }, [user])

  const completion = useMemo(() => {
    const required = [form.legal_name, form.owner_name, form.phone, form.address_line_1, form.postcode, form.city]
    return Math.round((required.filter((value) => value.trim()).length / required.length) * 100)
  }, [form])

  function update<K extends keyof CompanyForm>(key: K, value: CompanyForm[K]) {
    setForm((current) => ({ ...current, [key]: value }))
  }

  async function uploadAsset(kind: CompanyAssetKind, file: File) {
    if (!supabase || !user) return
    if (!companyId) {
      setError('Simpan Profil Syarikat dahulu sebelum memuat naik aset.')
      return
    }
    const validationError = validateCompanyAsset(file)
    if (validationError) {
      setError(validationError)
      return
    }

    setAssetBusy(kind)
    setError('')
    setNotice('')
    const label = companyAssetLabel(kind)
    const previousPath = kind === 'signature' ? assetPaths.signature_path : assetPaths.stamp_path
    const nextPath = buildCompanyAssetPath(user.id, companyId, kind, file)
    try {
      const { error: uploadError } = await supabase.storage
        .from(companyAssetBucket)
        .upload(nextPath, file, { cacheControl: '3600', contentType: file.type, upsert: false })
      if (uploadError) throw uploadError

      const pathUpdate = kind === 'signature'
        ? { signature_path: nextPath }
        : { stamp_path: nextPath }
      const { error: updateError } = await supabase
        .from('companies')
        .update(pathUpdate)
        .eq('id', companyId)
        .eq('owner_user_id', user.id)
      if (updateError) {
        await supabase.storage.from(companyAssetBucket).remove([nextPath])
        throw updateError
      }

      const nextAssetPaths = kind === 'signature'
        ? { ...assetPaths, signature_path: nextPath }
        : { ...assetPaths, stamp_path: nextPath }
      setAssetPaths(nextAssetPaths)
      const warnings: string[] = []
      try {
        setAssetUrls(await createAssetPreviewUrls(nextAssetPaths))
      } catch {
        warnings.push('pratonton akan dicuba semula apabila halaman dibuka semula')
      }

      if (previousPath && previousPath !== nextPath) {
        const { error: removeOldError } = await supabase.storage.from(companyAssetBucket).remove([previousPath])
        if (removeOldError) warnings.push('fail lama tidak dapat dibersihkan sekarang')
      }
      setNotice(`${label} berjaya disimpan${warnings.length ? `; ${warnings.join(' dan ')}` : ''}.`)
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : `${label} tidak dapat dimuat naik.`)
    } finally {
      setAssetBusy(null)
    }
  }

  async function removeAsset(kind: CompanyAssetKind) {
    if (!supabase || !user || !companyId) return
    const currentPath = kind === 'signature' ? assetPaths.signature_path : assetPaths.stamp_path
    if (!currentPath || !window.confirm(`Buang ${companyAssetLabel(kind).toLocaleLowerCase('ms-MY')} ini?`)) return

    setAssetBusy(kind)
    setError('')
    setNotice('')
    const label = companyAssetLabel(kind)
    try {
      const pathUpdate = kind === 'signature'
        ? { signature_path: null }
        : { stamp_path: null }
      const { error: updateError } = await supabase
        .from('companies')
        .update(pathUpdate)
        .eq('id', companyId)
        .eq('owner_user_id', user.id)
      if (updateError) throw updateError

      setAssetPaths((current) => kind === 'signature'
        ? { ...current, signature_path: null }
        : { ...current, stamp_path: null })
      setAssetUrls((current) => ({ ...current, [kind]: null }))
      const { error: storageError } = await supabase.storage.from(companyAssetBucket).remove([currentPath])
      setNotice(storageError
        ? `${label} dibuang daripada profil, tetapi fail private lama tidak dapat dibersihkan sekarang.`
        : `${label} berjaya dibuang.`)
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : `${label} tidak dapat dibuang.`)
    } finally {
      setAssetBusy(null)
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!supabase || !user) return

    setError('')
    setNotice('')

    const profileValues = {
      legal_name: form.legal_name.trim(),
      trading_name: nullable(form.trading_name),
      registration_no: nullable(form.registration_no),
      owner_name: form.owner_name.trim(),
      phone: form.phone.trim(),
      email: nullable(form.email),
      website: nullable(form.website),
      address_line_1: nullable(form.address_line_1),
      address_line_2: nullable(form.address_line_2),
      postcode: nullable(form.postcode),
      city: nullable(form.city),
      state: form.state.trim() || 'Johor',
      country_code: 'MY',
      business_description: nullable(form.business_description),
      cidb_registration_no: nullable(form.cidb_registration_no),
      cidb_grade: nullable(form.cidb_grade),
      cidb_expiry_date: nullable(form.cidb_expiry_date),
      mof_registration_no: nullable(form.mof_registration_no),
      other_license_notes: nullable(form.other_license_notes),
      bank_name: nullable(form.bank_name),
      bank_account_name: nullable(form.bank_account_name),
      bank_account_no: nullable(form.bank_account_no),
    }

    try {
      setSaving(true)
      if (companyId) {
        const { error: updateError } = await supabase.from('companies').update(profileValues).eq('id', companyId)
        if (updateError) throw updateError
      } else {
        const { data, error: insertError } = await supabase
          .from('companies')
          .insert({ ...profileValues, owner_user_id: user.id })
          .select('id')
          .single()
        if (insertError) throw insertError
        setCompanyId(data.id)
      }
      setNotice('Profil syarikat berjaya disimpan.')
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Profil tidak dapat disimpan.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600">Memuatkan profil syarikat...</div>
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-bold text-amber-700">Tetapan dokumen</p>
          <h1 className="mt-1 text-2xl font-black tracking-tight sm:text-3xl">Profil Syarikat</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">Maklumat ini akan digunakan semula pada sebutharga, invois, resit dan profil syarikat PDF.</p>
        </div>
        <div className="min-w-40 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between text-sm font-bold">
            <span>Kelengkapan</span>
            <span>{completion}%</span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
            <div className="h-full rounded-full bg-amber-400 transition-all" style={{ width: `${completion}%` }} />
          </div>
        </div>
      </header>

      {error && <p role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-700">{error}</p>}
      {notice && <p role="status" className="flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-medium text-emerald-800"><CheckCircle2 className="h-5 w-5" />{notice}</p>}

      <ProfileSection icon={<Building2 />} title="Maklumat utama" description="Maklumat wajib yang akan keluar pada kepala dokumen.">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nama berdaftar syarikat" required value={form.legal_name} onChange={(value) => update('legal_name', value)} placeholder="Contoh: MRPI Resources" />
          <Field label="Nama dagangan" value={form.trading_name} onChange={(value) => update('trading_name', value)} placeholder="Jika berbeza" />
          <Field label="No. pendaftaran SSM" value={form.registration_no} onChange={(value) => update('registration_no', value)} />
          <Field label="Nama pemilik / penandatangan" required value={form.owner_name} onChange={(value) => update('owner_name', value)} />
          <Field label="No. telefon" required type="tel" value={form.phone} onChange={(value) => update('phone', value)} placeholder="01X-XXXXXXX" />
          <Field label="E-mel syarikat" type="email" value={form.email} onChange={(value) => update('email', value)} />
          <div className="sm:col-span-2">
            <Field label="Laman web" type="url" value={form.website} onChange={(value) => update('website', value)} placeholder="https://" />
          </div>
          <div className="sm:col-span-2">
            <TextArea label="Penerangan ringkas syarikat" value={form.business_description} onChange={(value) => update('business_description', value)} placeholder="Skop utama kerja dan kawasan perkhidmatan." />
          </div>
        </div>
      </ProfileSection>

      <ProfileSection icon={<MapPin />} title="Alamat syarikat" description="Digunakan pada dokumen rasmi dan profil syarikat.">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2"><Field label="Alamat baris 1" required value={form.address_line_1} onChange={(value) => update('address_line_1', value)} /></div>
          <div className="sm:col-span-2"><Field label="Alamat baris 2" value={form.address_line_2} onChange={(value) => update('address_line_2', value)} /></div>
          <Field label="Poskod" required inputMode="numeric" value={form.postcode} onChange={(value) => update('postcode', value)} />
          <Field label="Bandar / daerah" required value={form.city} onChange={(value) => update('city', value)} />
          <Field label="Negeri" required value={form.state} onChange={(value) => update('state', value)} />
          <Field label="Negara" value="Malaysia" onChange={() => undefined} disabled />
        </div>
      </ProfileSection>

      <ProfileSection icon={<ShieldCheck />} title="Lesen dan pendaftaran" description="Pilihan. Isi hanya yang berkaitan dengan syarikat.">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="No. CIDB" value={form.cidb_registration_no} onChange={(value) => update('cidb_registration_no', value)} />
          <Field label="Gred CIDB" value={form.cidb_grade} onChange={(value) => update('cidb_grade', value)} placeholder="Contoh: G1" />
          <Field label="Tarikh tamat CIDB" type="date" value={form.cidb_expiry_date} onChange={(value) => update('cidb_expiry_date', value)} />
          <Field label="No. pendaftaran MOF" value={form.mof_registration_no} onChange={(value) => update('mof_registration_no', value)} />
          <div className="sm:col-span-2"><TextArea label="Lesen / pendaftaran lain" value={form.other_license_notes} onChange={(value) => update('other_license_notes', value)} /></div>
        </div>
      </ProfileSection>

      <ProfileSection icon={<Landmark />} title="Akaun pembayaran" description="Akan dipaparkan pada invois dan arahan pembayaran.">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nama bank" value={form.bank_name} onChange={(value) => update('bank_name', value)} />
          <Field label="Nama pemegang akaun" value={form.bank_account_name} onChange={(value) => update('bank_account_name', value)} />
          <div className="sm:col-span-2"><Field label="No. akaun" inputMode="numeric" value={form.bank_account_no} onChange={(value) => update('bank_account_no', value)} /></div>
        </div>
      </ProfileSection>

      <ProfileSection
        icon={<FileImage />}
        title="Tandatangan & cop"
        description="Pilihan. Disimpan secara private untuk dokumen yang memerlukannya; tidak dipaparkan pada sebutharga."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <CompanyAssetCard
            kind="signature"
            path={assetPaths.signature_path}
            previewUrl={assetUrls.signature}
            busy={assetBusy === 'signature'}
            disabled={!companyId || assetBusy !== null}
            profileSaved={Boolean(companyId)}
            onSelect={(file) => void uploadAsset('signature', file)}
            onRemove={() => void removeAsset('signature')}
          />
          <CompanyAssetCard
            kind="stamp"
            path={assetPaths.stamp_path}
            previewUrl={assetUrls.stamp}
            busy={assetBusy === 'stamp'}
            disabled={!companyId || assetBusy !== null}
            profileSaved={Boolean(companyId)}
            onSelect={(file) => void uploadAsset('stamp', file)}
            onRemove={() => void removeAsset('stamp')}
          />
        </div>
        <p className="mt-4 text-xs leading-5 text-slate-500">PNG berlatar lutsinar disyorkan. Format JPG, PNG atau WebP sehingga 5 MB diterima.</p>
      </ProfileSection>

      <div className="sticky bottom-20 z-10 rounded-2xl border border-slate-200 bg-white/95 p-3 shadow-xl shadow-slate-300/60 backdrop-blur lg:bottom-4">
        <button type="submit" disabled={saving || assetBusy !== null} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-slate-950 px-5 text-sm font-black text-white hover:bg-slate-800 disabled:opacity-60 sm:ml-auto sm:w-auto">
          <Save className="h-5 w-5" />
          {saving ? 'Menyimpan...' : 'Simpan Profil'}
        </button>
      </div>
    </form>
  )
}

function ProfileSection({ icon, title, description, children }: { icon: ReactNode; title: string; description: string; children: ReactNode }) {
  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="mb-5 flex gap-3">
        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-amber-100 text-amber-800 [&>svg]:h-5 [&>svg]:w-5">{icon}</div>
        <div>
          <h2 className="font-black text-slate-950">{title}</h2>
          <p className="mt-1 text-xs leading-5 text-slate-500">{description}</p>
        </div>
      </div>
      {children}
    </section>
  )
}

function CompanyAssetCard({
  kind,
  path,
  previewUrl,
  busy,
  disabled,
  profileSaved,
  onSelect,
  onRemove,
}: {
  kind: CompanyAssetKind
  path: string | null
  previewUrl: string | null
  busy: boolean
  disabled: boolean
  profileSaved: boolean
  onSelect: (file: File) => void
  onRemove: () => void
}) {
  const label = companyAssetLabel(kind)
  const inputId = `company-${kind}-upload`
  const Icon = kind === 'signature' ? PenTool : Stamp

  return (
    <article className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <div className="flex items-center gap-2 text-sm font-black text-slate-950">
        <Icon className="h-5 w-5 text-amber-700" />
        {label}
        <span className="ml-auto rounded-full bg-white px-2 py-1 text-[10px] font-black uppercase tracking-wide text-slate-500">Pilihan</span>
      </div>

      <div className="mt-3 grid h-36 place-items-center overflow-hidden rounded-xl border border-dashed border-slate-300 bg-white p-3">
        {previewUrl ? (
          <img src={previewUrl} alt={`Pratonton ${label.toLocaleLowerCase('ms-MY')}`} className="h-full w-full object-contain" />
        ) : (
          <div className="text-center text-slate-400">
            <Icon className="mx-auto h-9 w-9" />
            <p className="mt-2 text-xs font-bold">{path ? 'Pratonton belum tersedia' : 'Belum dimuat naik'}</p>
          </div>
        )}
      </div>

      <div className={`mt-3 grid gap-2 ${path ? 'grid-cols-2' : 'grid-cols-1'}`}>
        <label
          htmlFor={inputId}
          aria-disabled={disabled}
          className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-3 text-xs font-black ${disabled ? 'cursor-not-allowed bg-slate-200 text-slate-400' : 'cursor-pointer bg-slate-950 text-white hover:bg-slate-800'}`}
        >
          <Upload className="h-4 w-4" />
          {busy ? 'Memuat naik...' : path ? 'Ganti' : 'Muat naik'}
          <input
            id={inputId}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            disabled={disabled}
            className="sr-only"
            onChange={(event) => {
              const file = event.target.files?.[0]
              event.target.value = ''
              if (file) onSelect(file)
            }}
          />
        </label>
        {path && (
          <button
            type="button"
            disabled={disabled}
            onClick={onRemove}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-red-200 bg-white px-3 text-xs font-black text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Trash2 className="h-4 w-4" />
            Buang
          </button>
        )}
      </div>
      {!profileSaved && <p className="mt-2 text-xs leading-5 text-amber-800">Simpan Profil dahulu untuk membuka fungsi muat naik.</p>}
    </article>
  )
}

function Field({ label, value, onChange, required = false, disabled = false, type = 'text', inputMode, placeholder }: { label: string; value: string; onChange: (value: string) => void; required?: boolean; disabled?: boolean; type?: string; inputMode?: 'text' | 'email' | 'tel' | 'url' | 'numeric'; placeholder?: string }) {
  return (
    <label className="block">
      <span className="field-label">{label}{required && <span className="ml-1 text-red-600">*</span>}</span>
      <input type={type} inputMode={inputMode} required={required} disabled={disabled} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className="field-control disabled:bg-slate-100 disabled:text-slate-500" />
    </label>
  )
}

function TextArea({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string }) {
  return (
    <label className="block">
      <span className="field-label">{label}</span>
      <textarea value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className="field-control resize-y" />
    </label>
  )
}
