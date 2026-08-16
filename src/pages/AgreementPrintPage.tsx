import { ArrowLeft, FileDown } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useLocation } from 'wouter'
import { useAuth } from '../auth/AuthProvider'
import {
  agreementAcceptanceLabel,
  agreementStatusLabel,
  isAgreementSnapshotData,
  type AgreementSnapshotData,
  type ProjectAgreement,
} from '../lib/agreement'
import { formatMoney } from '../lib/quotation'
import { supabase } from '../lib/supabase'
import type { Database } from '../types/database'

type Company = Database['public']['Tables']['companies']['Row']
type Project = Database['public']['Tables']['projects']['Row']
type ProjectSection = Database['public']['Tables']['project_sections']['Row']
type ProjectItem = Database['public']['Tables']['project_items']['Row']
type Schedule = Database['public']['Tables']['payment_schedules']['Row']
type Stage = Database['public']['Tables']['payment_schedule_stages']['Row']

export function AgreementPrintPage({ projectId }: { projectId: string }) {
  const { user } = useAuth()
  const [, navigate] = useLocation()
  const [agreement, setAgreement] = useState<ProjectAgreement | null>(null)
  const [document, setDocument] = useState<AgreementSnapshotData | null>(null)
  const [assetUrls, setAssetUrls] = useState({ signature: '', stamp: '' })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!supabase || !user) return
    const numericProjectId = Number(projectId)
    if (!Number.isInteger(numericProjectId) || numericProjectId <= 0) {
      setError('ID projek tidak sah.')
      setLoading(false)
      return
    }
    const client = supabase
    const currentUser = user
    let mounted = true

    async function load() {
      const { data: company, error: companyError } = await client.from('companies').select('*').eq('owner_user_id', currentUser.id).maybeSingle()
      if (!mounted) return
      if (companyError || !company) {
        setError(companyError?.message ?? 'Profil syarikat tidak ditemui.')
        setLoading(false)
        return
      }
      const [projectResult, agreementResult] = await Promise.all([
        client.from('projects').select('*').eq('id', numericProjectId).eq('company_id', company.id).maybeSingle(),
        client.from('project_agreements').select('*').eq('project_id', numericProjectId).eq('company_id', company.id).maybeSingle(),
      ])
      if (!mounted) return
      if (projectResult.error || agreementResult.error || !projectResult.data || !agreementResult.data) {
        setError(projectResult.error?.message ?? agreementResult.error?.message ?? 'Simpan draf perjanjian dahulu.')
        setLoading(false)
        return
      }

      let nextDocument: AgreementSnapshotData
      if (agreementResult.data.status !== 'draft') {
        const { data: snapshot, error: snapshotError } = await client.from('project_agreement_snapshots').select('snapshot_data').eq('agreement_id', agreementResult.data.id).eq('revision_no', agreementResult.data.revision_no).maybeSingle()
        if (snapshotError || !snapshot || !isAgreementSnapshotData(snapshot.snapshot_data)) {
          setError(snapshotError?.message ?? 'Snapshot perjanjian tidak ditemui.')
          setLoading(false)
          return
        }
        nextDocument = snapshot.snapshot_data
      } else {
        const [sectionResult, itemResult, scheduleResult] = await Promise.all([
          client.from('project_sections').select('*').eq('project_id', numericProjectId).order('sort_order').order('id'),
          client.from('project_items').select('*').eq('project_id', numericProjectId).order('sort_order').order('id'),
          client.from('payment_schedules').select('*').eq('project_id', numericProjectId).maybeSingle(),
        ])
        if (sectionResult.error || itemResult.error || scheduleResult.error || !scheduleResult.data) {
          setError(sectionResult.error?.message ?? itemResult.error?.message ?? scheduleResult.error?.message ?? 'Jadual pembayaran belum disimpan.')
          setLoading(false)
          return
        }
        const { data: stageRows, error: stageError } = await client.from('payment_schedule_stages').select('*').eq('schedule_id', scheduleResult.data.id).order('stage_no')
        if (stageError) {
          setError(stageError.message)
          setLoading(false)
          return
        }
        nextDocument = liveDocument(company, projectResult.data, agreementResult.data, sectionResult.data ?? [], itemResult.data ?? [], scheduleResult.data, stageRows ?? [])
      }

      const paths = [nextDocument.company.signature_path, nextDocument.company.stamp_path].filter((path): path is string => Boolean(path))
      if (paths.length) {
        const { data: signed } = await client.storage.from('company-assets').createSignedUrls(paths, 60 * 60)
        const byPath = new Map((signed ?? []).map((row) => [row.path, row.signedUrl]))
        if (mounted) setAssetUrls({
          signature: nextDocument.company.signature_path ? byPath.get(nextDocument.company.signature_path) ?? '' : '',
          stamp: nextDocument.company.stamp_path ? byPath.get(nextDocument.company.stamp_path) ?? '' : '',
        })
      }
      if (mounted) {
        setAgreement(agreementResult.data)
        setDocument(nextDocument)
        setLoading(false)
      }
    }

    void load()
    return () => { mounted = false }
  }, [projectId, user])

  if (loading) return <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600">Menyediakan perjanjian...</div>
  if (error || !agreement || !document) return <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm font-semibold text-red-700">{error || 'Perjanjian tidak dapat dibuka.'}</div>

  const brand = (document.company.trading_name || document.company.legal_name).toLocaleUpperCase('en-MY')
  const companyAddress = fullAddress(document.company)
  const siteAddress = fullAddress(document.project)
  const optionalTerms = ([
    ['Tempoh kerja / sasaran', document.agreement.work_duration_text],
    ['Barang dibekalkan pelanggan', document.agreement.client_supplied_items],
    ['Pengecualian kerja', document.agreement.exclusions],
    ['Kecacatan / waranti', document.agreement.defect_terms],
    ['Terma tambahan', document.agreement.additional_terms],
  ] satisfies Array<[string, string]>).filter(([, value]) => value.trim())

  return (
    <div className="print-page-wrap">
      <div className="no-print mb-5 flex flex-wrap items-center justify-between gap-3"><button type="button" onClick={() => navigate(`/projek/${projectId}/perjanjian`)} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 text-sm font-black text-slate-700"><ArrowLeft className="h-5 w-5" />Kembali</button><button type="button" onClick={() => window.print()} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-amber-400 px-5 text-sm font-black text-slate-950"><FileDown className="h-5 w-5" />Cetak / Simpan PDF</button></div>
      {agreement.status === 'draft' && <p className="no-print mb-5 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm font-semibold text-amber-900">Ini pratonton draf. Keluarkan perjanjian untuk membekukan skop dan jadual bayaran.</p>}

      <article className="print-document mx-auto overflow-hidden bg-white text-slate-950 shadow-xl">
        <header className="border-b-8 border-amber-400 bg-slate-950 px-8 py-7 text-white"><div className="flex items-start justify-between gap-6"><div><p className="text-2xl font-black tracking-tight text-amber-300">{brand}</p>{document.company.registration_no && <p className="mt-1 text-xs font-semibold text-slate-300">{document.company.registration_no}</p>}<p className="mt-3 max-w-md text-xs leading-5 text-slate-300">{companyAddress}</p><p className="mt-1 text-xs text-slate-300">{document.company.phone}</p></div><div className="text-right"><p className="text-sm font-black tracking-[0.18em] text-amber-300">PERJANJIAN PROJEK</p><p className="mt-2 text-lg font-black">{document.agreement.agreement_no}</p><p className="mt-1 text-xs text-slate-300">Rev {document.agreement.revision_no} · {formatLongDate(document.agreement.issue_date)}</p><p className="mt-2 inline-block rounded-full bg-white/10 px-3 py-1 text-[10px] font-black">{agreementStatusLabel(agreement.status)}</p></div></div></header>

        <div className="px-8 py-7">
          <section className="text-center"><p className="text-xs font-black uppercase tracking-[0.16em] text-amber-700">Perjanjian antara kontraktor dan pelanggan</p><h1 className="mt-2 text-2xl font-black">{document.agreement.title}</h1></section>

          <section className="mt-7 grid grid-cols-2 gap-6 border-y border-slate-200 py-6 text-sm"><Party label="Kontraktor" name={document.company.legal_name} details={[document.company.owner_name, document.company.registration_no, document.company.phone]} /><Party label="Pelanggan" name={document.project.client_name} details={[document.project.client_phone, document.project.client_email]} /></section>

          <section className="py-6"><p className="text-[10px] font-black uppercase tracking-[0.16em] text-amber-700">Butiran projek</p><div className="mt-3 grid grid-cols-2 gap-4 rounded-2xl bg-slate-100 p-5 text-xs"><Info label="No. projek" value={document.project.project_no} /><Info label="Rujukan sebutharga" value={`${document.project.quotation_no} Rev ${document.project.quotation_revision_no}`} /><Info label="Nama projek" value={document.project.project_name} wide /><Info label="Alamat tapak" value={siteAddress} wide /><Info label="Nilai kontrak semasa" value={formatMoney(Number(document.project.current_contract_amount))} wide strong /></div></section>

          <section className="pb-6"><h2 className="text-lg font-black">1. Skop kerja yang dipersetujui</h2><p className="mt-2 text-xs leading-5 text-slate-600">Kontraktor akan melaksanakan skop berikut berdasarkan rekod projek semasa perjanjian ini dikeluarkan. Perubahan harga atau skop selepas ini hendaklah melalui Variation Order yang diluluskan.</p><div className="mt-4 space-y-3">{document.scope.map((section) => <div key={`${section.sort_order}-${section.name}`} className="rounded-2xl border border-slate-200 p-4"><h3 className="text-xs font-black uppercase tracking-wide text-amber-800">{section.name}</h3><ul className="mt-2 space-y-2">{section.items.map((item, index) => <li key={`${item.sort_order}-${item.item_name}`} className="grid grid-cols-[1.5rem_1fr] text-xs leading-5"><span className="font-black text-slate-400">{index + 1}.</span><div><p className="font-black">{item.item_name}</p>{item.description && <p className="text-slate-600">{item.description}</p>}{item.measurement_text && <p className="text-blue-700">{item.measurement_text}</p>}</div></li>)}</ul></div>)}</div></section>

          <section className="pb-6"><h2 className="text-lg font-black">2. Jadual pembayaran</h2><p className="mt-2 text-xs leading-5 text-slate-600">Setiap tuntutan adalah berdasarkan tahap yang dicapai. Jumlah tahap di bawah dibekukan bersama perjanjian ini.</p><table className="quotation-table mt-4 w-full border-collapse text-left text-xs"><thead><tr className="bg-slate-950 text-white"><th className="w-10 px-3 py-3 text-center">Bil.</th><th className="px-3 py-3">Tahap / pencapaian</th><th className="w-20 px-3 py-3 text-right">Peratus</th><th className="w-32 px-3 py-3 text-right">Jumlah (RM)</th></tr></thead><tbody>{document.payment_schedule.stages.map((stage) => <tr key={stage.stage_no} className="border-b border-slate-200 align-top"><td className="px-3 py-3 text-center font-bold text-slate-500">{stage.stage_no}</td><td className="px-3 py-3"><p className="font-black">{stage.label}</p>{stage.description && <p className="mt-1 leading-5 text-slate-600">{stage.description}</p>}</td><td className="px-3 py-3 text-right font-black">{Number(stage.percentage)}%</td><td className="px-3 py-3 text-right font-black">{formatNumber(Number(stage.amount))}</td></tr>)}<tr className="bg-amber-50 font-black"><td colSpan={2} className="px-3 py-4 text-right">JUMLAH KESELURUHAN</td><td className="px-3 py-4 text-right">100%</td><td className="px-3 py-4 text-right">{formatNumber(Number(document.payment_schedule.basis_amount))}</td></tr></tbody></table>{document.payment_schedule.notes && <p className="mt-3 whitespace-pre-line text-xs leading-5 text-slate-600">{document.payment_schedule.notes}</p>}</section>

          <section className="pb-6"><h2 className="text-lg font-black">3. Terma utama</h2><ol className="mt-3 space-y-3 text-xs leading-5 text-slate-700"><li><strong>3.1 Bayaran.</strong> Bayaran dibuat mengikut jadual di atas. Tahap pertama ialah bayaran permulaan yang akan diinvois dengan jumlah tetap seperti dinyatakan.</li><li><strong>3.2 Perubahan kerja.</strong> Sebarang perubahan skop atau harga selepas perjanjian diterima mesti direkod dan diluluskan melalui Variation Order sebelum dilaksanakan.</li><li><strong>3.3 Kerosakan tersembunyi.</strong> Kerosakan atau keadaan tersembunyi yang tidak termasuk dalam skop asal akan dinilai berasingan dan, jika melibatkan perubahan kerja atau harga, dikemukakan melalui Variation Order.</li><li><strong>3.4 Kemajuan kerja.</strong> Tarikh mula operasi projek ditetapkan secara berasingan selepas perjanjian diterima dan tidak berlaku secara automatik.</li></ol></section>

          {optionalTerms.length > 0 && <section className="pb-6"><h2 className="text-lg font-black">4. Terma khusus</h2><div className="mt-3 space-y-3">{optionalTerms.map(([label, value]) => <div key={label} className="rounded-xl border border-slate-200 p-3 text-xs leading-5"><p className="font-black">{label}</p><p className="mt-1 whitespace-pre-line text-slate-600">{value}</p></div>)}</div></section>}

          <section className="mt-2 grid grid-cols-2 gap-8 border-t border-slate-200 pt-8 text-xs"><div><p className="font-black">Bagi pihak kontraktor</p><div className="mt-4 flex h-24 items-end gap-2">{assetUrls.signature && <img src={assetUrls.signature} alt="Tandatangan syarikat" className="max-h-20 max-w-36 object-contain" />}{assetUrls.stamp && <img src={assetUrls.stamp} alt="Cop syarikat" className="max-h-20 max-w-24 object-contain" />}</div><div className="border-t border-slate-400 pt-2"><p className="font-black">{document.company.owner_name}</p><p>{document.company.legal_name}</p></div></div><div><p className="font-black">Penerimaan pelanggan</p>{agreement.status === 'accepted' ? <div className="mt-4 rounded-xl bg-emerald-50 p-4 leading-5 text-emerald-900"><p className="font-black">{agreementAcceptanceLabel(agreement.acceptance_method)}</p><p className="mt-1">Direkod pada {formatLongDateTime(agreement.accepted_at)}</p>{agreement.acceptance_note && <p className="mt-1 whitespace-pre-line">{agreement.acceptance_note}</p>}</div> : <div className="mt-20 border-t border-slate-400 pt-2"><p className="font-black">{document.project.client_name}</p><p>Tarikh: ____________________</p></div>}</div></section>

          <footer className="mt-8 border-t border-slate-200 pt-4 text-[10px] leading-4 text-slate-500"><p>Dokumen ini mesti dibaca bersama sebutharga diterima dan Variation Order yang diluluskan, jika ada. Snapshot sistem mengekalkan versi yang dikeluarkan.</p></footer>
        </div>
      </article>
    </div>
  )
}

function liveDocument(company: Company, project: Project, agreement: ProjectAgreement, sections: ProjectSection[], items: ProjectItem[], schedule: Schedule, stages: Stage[]): AgreementSnapshotData {
  return {
    agreement: { agreement_no: agreement.agreement_no, revision_no: agreement.revision_no, issue_date: agreement.issue_date, title: agreement.title, work_duration_text: agreement.work_duration_text, client_supplied_items: agreement.client_supplied_items, exclusions: agreement.exclusions, defect_terms: agreement.defect_terms, additional_terms: agreement.additional_terms },
    company: { legal_name: company.legal_name, trading_name: company.trading_name, registration_no: company.registration_no, owner_name: company.owner_name, phone: company.phone, address_line_1: company.address_line_1, address_line_2: company.address_line_2, postcode: company.postcode, city: company.city, state: company.state, signature_path: company.signature_path, stamp_path: company.stamp_path },
    project: { id: project.id, project_no: project.project_no, project_name: project.project_name, quotation_no: project.quotation_no, quotation_revision_no: project.quotation_revision_no, client_name: project.client_name, client_phone: project.client_phone, client_email: project.client_email, address_line_1: project.address_line_1, address_line_2: project.address_line_2, postcode: project.postcode, city: project.city, state: project.state, contract_amount: Number(project.contract_amount), current_contract_amount: Number(project.current_contract_amount), planned_start_date: project.planned_start_date, planned_end_date: project.planned_end_date },
    scope: sections.map((section) => ({ name: section.name, sort_order: section.sort_order, items: items.filter((item) => item.section_id === section.id).map((item) => ({ item_name: item.item_name, description: item.description, measurement_text: item.measurement_text, unit: item.unit, quantity: Number(item.quantity), amount: Number(item.amount), sort_order: item.sort_order })) })),
    payment_schedule: { title: schedule.title, notes: schedule.notes, basis_amount: Number(schedule.basis_amount), stages: stages.map((stage) => ({ stage_no: stage.stage_no, label: stage.label, description: stage.description, percentage: Number(stage.percentage), amount: Number(stage.amount) })) },
  }
}

function Party({ label, name, details }: { label: string; name: string; details: Array<string | null> }) { return <div><p className="text-[10px] font-black uppercase tracking-[0.16em] text-amber-700">{label}</p><p className="mt-2 text-lg font-black">{name}</p>{details.filter(Boolean).map((detail) => <p key={detail} className="mt-1 text-slate-600">{detail}</p>)}</div> }
function Info({ label, value, wide, strong }: { label: string; value: string; wide?: boolean; strong?: boolean }) { return <div className={wide ? 'col-span-2' : ''}><p className="font-black text-slate-500">{label}</p><p className={`mt-1 leading-5 ${strong ? 'text-lg font-black text-amber-800' : 'font-semibold'}`}>{value}</p></div> }
function fullAddress(row: { address_line_1: string | null; address_line_2: string | null; postcode: string | null; city: string | null; state: string }) { return [row.address_line_1, row.address_line_2, [row.postcode, row.city].filter(Boolean).join(' '), row.state].filter(Boolean).join(', ') }
function formatNumber(value: number) { return value.toLocaleString('ms-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }
function formatLongDate(value: string) { const [year = 1970, month = 1, day = 1] = value.slice(0, 10).split('-').map(Number); return new Intl.DateTimeFormat('ms-MY', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(year, month - 1, day)) }
function formatLongDateTime(value: string | null) { return value ? new Intl.DateTimeFormat('ms-MY', { dateStyle: 'long', timeStyle: 'short' }).format(new Date(value)) : '—' }
