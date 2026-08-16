import { ArrowLeft, FileDown, Info as InfoIcon } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { useLocation } from 'wouter'
import { useAuth } from '../auth/AuthProvider'
import {
  agreementAcceptanceLabel,
  agreementStatusLabel,
  isAgreementSnapshotData,
  type AgreementSnapshotData,
  type ProjectAgreement,
} from '../lib/agreement'
import {
  agreementDocumentTermsFromSnapshot,
  currentAgreementDocumentTerms,
  legacyAgreementDocumentTerms,
  type AgreementTermSection,
} from '../lib/agreementTerms'
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
  const frozenTerms = agreementDocumentTermsFromSnapshot(document.document)
  const termsAreFrozen = Boolean(frozenTerms)
  const contractTerms = frozenTerms
    ? frozenTerms
    : agreement.status === 'draft'
      ? currentAgreementDocumentTerms()
      : legacyAgreementDocumentTerms
  const sectionOne = contractTerms.standard_terms.find((section) => section.number === '1')
  const sectionThree = contractTerms.standard_terms.find((section) => section.number === '3')
  const remainingSections = contractTerms.standard_terms.filter((section) => !['1', '3'].includes(section.number))
  const specialTerms = [
    ['9.1 Tempoh kerja / sasaran', document.agreement.work_duration_text],
    ['9.2 Kecacatan / waranti', document.agreement.defect_terms],
    ['9.3 Terma tambahan', document.agreement.additional_terms],
  ] satisfies Array<[string, string]>

  return (
    <div className="print-page-wrap">
      <div className="no-print mb-4 flex flex-wrap items-center justify-between gap-3">
        <button type="button" onClick={() => navigate(`/projek/${projectId}/perjanjian`)} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 text-sm font-black text-slate-700"><ArrowLeft className="h-5 w-5" />Kembali</button>
        <button type="button" onClick={() => window.print()} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-amber-400 px-5 text-sm font-black text-slate-950"><FileDown className="h-5 w-5" />Cetak A4 / Simpan PDF</button>
      </div>
      <div className="no-print mb-5 flex items-start gap-3 rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm leading-6 text-blue-950"><InfoIcon className="mt-0.5 h-5 w-5 shrink-0 text-blue-700" /><p>Dalam dialog cetak, pilih <strong>A4</strong>, skala <strong>100%</strong> dan matikan header/footer pelayar. Pratonton Android kadangkala menggunakan “Letter” walaupun dokumen ini direka untuk A4.</p></div>
      {agreement.status === 'draft' && <p className="no-print mb-5 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm font-semibold text-amber-900">Ini pratonton draf. Keluarkan perjanjian untuk membekukan skop, jadual bayaran dan teks terma standard bagi revisi ini.</p>}
      {agreement.status !== 'draft' && !termsAreFrozen && <p className="no-print mb-5 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-800">Rekod ini dikeluarkan menggunakan format terdahulu yang tidak menyimpan teks terma standard dalam snapshot. Versi terdahulu dikekalkan; mulakan revisi baharu untuk format kontrak lengkap.</p>}

      <article className="print-document agreement-print-document mx-auto bg-white text-slate-950 shadow-xl">
        <header className="agreement-brand-header">
          <div>
            <p className="agreement-brand-name">{brand}</p>
            <div className="agreement-brand-details">
              {document.company.registration_no && <p>No. pendaftaran: {document.company.registration_no}</p>}
              {document.company.cidb_registration_no && <p>CIDB: {document.company.cidb_registration_no}{document.company.cidb_grade ? ` · Gred ${document.company.cidb_grade}` : ''}{document.company.cidb_expiry_date ? ` · Sah hingga ${formatLongDate(document.company.cidb_expiry_date)}` : ''}</p>}
              <p>{companyAddress}</p>
              <p>{[document.company.phone, document.company.email].filter(Boolean).join(' · ')}</p>
            </div>
          </div>
          <div className="agreement-document-id">
            <p>PERJANJIAN PROJEK</p>
            <strong>{document.agreement.agreement_no}</strong>
            <span>Rev {document.agreement.revision_no} · {formatLongDate(document.agreement.issue_date)}</span>
            <b>{agreementStatusLabel(agreement.status)}</b>
          </div>
        </header>

        <main className="agreement-body">
          {agreement.status === 'draft' && <div className="agreement-draft-mark">DRAF · BUKAN UNTUK DITANDATANGANI</div>}

          <section className="agreement-cover-page">
            <div className="agreement-title-block">
              <p>PERJANJIAN ANTARA KONTRAKTOR DAN PELANGGAN</p>
              <h1>{document.agreement.title}</h1>
              <span>Dokumen ini hendaklah dibaca sepenuhnya bersama semua lampiran yang dirujuk.</span>
            </div>

            <p className="agreement-recital">Perjanjian ini dibuat pada <strong>{formatLongDate(document.agreement.issue_date)}</strong> antara pihak-pihak berikut bagi kerja di tapak yang dinyatakan. Pihak-pihak mengesahkan bahawa mereka mempunyai kuasa untuk membuat perjanjian ini dan berniat untuk terikat dengan termanya apabila diterima menurut Klausa 1.1.</p>

            <div className="agreement-party-grid">
              <PartyCard label="Kontraktor" name={document.company.legal_name} rows={[
                document.company.registration_no ? `No. pendaftaran: ${document.company.registration_no}` : null,
                document.company.cidb_registration_no ? `CIDB: ${document.company.cidb_registration_no}${document.company.cidb_grade ? ` · Gred ${document.company.cidb_grade}` : ''}${document.company.cidb_expiry_date ? ` · Sah hingga ${formatLongDate(document.company.cidb_expiry_date)}` : ''}` : null,
                `Wakil: ${document.company.owner_name}`,
                companyAddress,
                [document.company.phone, document.company.email].filter(Boolean).join(' · '),
              ]} />
              <PartyCard label="Pelanggan" name={document.project.client_name} rows={[
                `Telefon: ${document.project.client_phone}`,
                document.project.client_email ? `E-mel: ${document.project.client_email}` : null,
                `Alamat notis: ${siteAddress}`,
              ]} />
            </div>

            <section className="agreement-section agreement-keep-together">
              <SectionHeading number="A" title="Butiran Kontrak" />
              <dl className="agreement-particulars">
                <Particular label="No. projek" value={document.project.project_no} />
                <Particular label="Sebutharga diterima" value={`${document.project.quotation_no} Rev ${document.project.quotation_revision_no}`} />
                <Particular label="Nama projek" value={document.project.project_name} wide />
                <Particular label="Alamat tapak" value={siteAddress} wide />
                <Particular label="Harga Kontrak" value={formatMoney(Number(document.project.current_contract_amount))} strong />
                <Particular label="Tarikh mula dirancang" value={formatOptionalDate(document.project.planned_start_date)} />
                <Particular label="Tarikh siap dirancang" value={formatOptionalDate(document.project.planned_end_date)} />
                <Particular label="Tempoh kerja" value={document.agreement.work_duration_text || 'Belum dinyatakan'} wide />
                <Particular label="Gantirugi kelewatan (LAD)" value="Tidak terpakai kecuali dinyatakan dalam Terma Khusus." />
                <Particular label="Wang tahanan" value="Tidak terpakai kecuali dinyatakan dalam Terma Khusus." />
              </dl>
            </section>

            {sectionOne && <TermSection section={sectionOne} />}
          </section>

          <section className="agreement-section agreement-scope-section">
            <SectionHeading number="2" title="Skop Kerja" />
            <p className="agreement-lead">Kontraktor hendaklah melaksanakan skop berikut mengikut Dokumen Kontrak. Kuantiti, ukuran dan penerangan hendaklah dibaca bersama sebutharga serta lukisan atau spesifikasi yang diluluskan.</p>
            <div className="agreement-scope-list">
              {document.scope.length ? document.scope.map((section) => (
                <div key={`${section.sort_order}-${section.name}`} className="agreement-scope-group">
                  <h3>{section.name}</h3>
                  {section.items.length ? <ol>{section.items.map((item) => (
                    <li key={`${item.sort_order}-${item.item_name}`}>
                      <div><strong>{item.item_name}</strong>{item.description && <p>{item.description}</p>}{item.measurement_text && <span>{item.measurement_text}</span>}</div>
                    </li>
                  ))}</ol> : <p className="agreement-empty">Tiada item direkodkan.</p>}
                </div>
              )) : <p className="agreement-empty">Tiada skop kerja direkodkan.</p>}
            </div>
            <div className="agreement-two-column-cards">
              <TextCard title="2.1 Barang dibekalkan Pelanggan" value={document.agreement.client_supplied_items} />
              <TextCard title="2.2 Pengecualian kerja" value={document.agreement.exclusions} />
            </div>
          </section>

          <section className="agreement-section agreement-payment-section">
            <SectionHeading number="3" title="Harga Kontrak dan Jadual Pembayaran" />
            <p className="agreement-lead">Jadual ini dibekukan bersama revisi perjanjian. Setiap tuntutan tertakluk kepada pencapaian yang dinyatakan dan invois Kontraktor.</p>
            <table className="agreement-payment-table quotation-table">
              <colgroup><col className="agreement-col-number" /><col /><col className="agreement-col-percent" /><col className="agreement-col-amount" /></colgroup>
              <thead><tr><th>Bil.</th><th>Tahap / pencapaian</th><th>Peratus</th><th>Jumlah (RM)</th></tr></thead>
              <tbody>
                {document.payment_schedule.stages.map((stage) => <tr key={stage.stage_no}><td>{stage.stage_no}</td><td><strong>{stage.label}</strong>{stage.description && <p>{stage.description}</p>}</td><td>{Number(stage.percentage)}%</td><td>{formatNumber(Number(stage.amount))}</td></tr>)}
                <tr className="agreement-payment-total"><td colSpan={2}>JUMLAH KESELURUHAN</td><td>100%</td><td>{formatNumber(Number(document.payment_schedule.basis_amount))}</td></tr>
              </tbody>
            </table>
            {document.payment_schedule.notes && <div className="agreement-payment-notes"><strong>Nota jadual:</strong><p>{document.payment_schedule.notes}</p></div>}
            {sectionThree && <TermSection section={sectionThree} hideHeading />}
          </section>

          {remainingSections.map((section) => <TermSection key={section.number} section={section} />)}

          <section className="agreement-section agreement-special-terms">
            <SectionHeading number="9" title="Terma Khusus" />
            <p className="agreement-lead">Terma di bawah mengatasi terma standard setakat percanggahan yang dinyatakan dengan jelas. Ruang kosong atau “tiada” tidak mewujudkan janji tambahan.</p>
            <div className="agreement-special-list">
              {specialTerms.map(([label, value]) => <TextCard key={label} title={label} value={value} />)}
            </div>
          </section>

          <section className="agreement-section agreement-signature-page">
            <SectionHeading number="10" title="Akuan dan Pelaksanaan" />
            <div className="agreement-declaration">Dengan menandatangani atau menerima Perjanjian ini, setiap pihak mengesahkan bahawa butirannya tepat, telah membaca dan memahami keseluruhan Dokumen Kontrak, berpeluang mendapatkan nasihat bebas, dan bersetuju terikat dengan <strong>{document.agreement.agreement_no} Rev {document.agreement.revision_no}</strong>.</div>

            {agreement.status === 'accepted' && <div className="agreement-acceptance-record">
              <p>REKOD PENERIMAAN ELEKTRONIK / SISTEM</p>
              <strong>{agreementAcceptanceLabel(agreement.acceptance_method)}</strong>
              <span>Direkod pada {formatLongDateTime(agreement.accepted_at)}</span>
              {agreement.acceptance_note && <em>{agreement.acceptance_note}</em>}
              {agreement.signed_copy_path && <small>Bukti private dilampirkan dalam rekod sistem.</small>}
            </div>}

            <div className="agreement-signature-grid">
              <SignatureCard title="Bagi pihak Kontraktor">
                <div className="agreement-signature-assets">{assetUrls.signature && <img src={assetUrls.signature} alt="Tandatangan Kontraktor" />}{assetUrls.stamp && <img src={assetUrls.stamp} alt="Cop syarikat" />}</div>
                <SignatureLine label="Tandatangan" />
                <SignatureValue label="Nama" value={document.company.owner_name} />
                <SignatureValue label="Jawatan" value="Pemilik / Wakil diberi kuasa" />
                <SignatureLine label="No. K/P / Pasport" />
                <SignatureLine label="Tarikh" />
                <WitnessBlock />
              </SignatureCard>
              <SignatureCard title="Pelanggan">
                <div className="agreement-signature-assets" />
                <SignatureLine label="Tandatangan" />
                <SignatureValue label="Nama" value={document.project.client_name} />
                <SignatureLine label="No. K/P / Pasport" />
                <SignatureLine label="Tarikh" />
                <WitnessBlock />
              </SignatureCard>
            </div>
          </section>

          <footer className="agreement-footer">
            <p>{document.agreement.agreement_no} · Rev {document.agreement.revision_no} · Templat {contractTerms.template_version}</p>
            <p>Dokumen ini mesti dibaca bersama semua lampiran dan Variation Order yang diluluskan. Simpan salinan lengkap serta bukti penerimaan.</p>
          </footer>
        </main>
      </article>
    </div>
  )
}

function liveDocument(company: Company, project: Project, agreement: ProjectAgreement, sections: ProjectSection[], items: ProjectItem[], schedule: Schedule, stages: Stage[]): AgreementSnapshotData {
  return {
    document: currentAgreementDocumentTerms(),
    agreement: { agreement_no: agreement.agreement_no, revision_no: agreement.revision_no, issue_date: agreement.issue_date, title: agreement.title, work_duration_text: agreement.work_duration_text, client_supplied_items: agreement.client_supplied_items, exclusions: agreement.exclusions, defect_terms: agreement.defect_terms, additional_terms: agreement.additional_terms },
    company: { legal_name: company.legal_name, trading_name: company.trading_name, registration_no: company.registration_no, owner_name: company.owner_name, phone: company.phone, email: company.email, address_line_1: company.address_line_1, address_line_2: company.address_line_2, postcode: company.postcode, city: company.city, state: company.state, cidb_registration_no: company.cidb_registration_no, cidb_grade: company.cidb_grade, cidb_expiry_date: company.cidb_expiry_date, signature_path: company.signature_path, stamp_path: company.stamp_path },
    project: { id: project.id, project_no: project.project_no, project_name: project.project_name, quotation_no: project.quotation_no, quotation_revision_no: project.quotation_revision_no, client_name: project.client_name, client_phone: project.client_phone, client_email: project.client_email, address_line_1: project.address_line_1, address_line_2: project.address_line_2, postcode: project.postcode, city: project.city, state: project.state, contract_amount: Number(project.contract_amount), current_contract_amount: Number(project.current_contract_amount), planned_start_date: project.planned_start_date, planned_end_date: project.planned_end_date },
    scope: sections.map((section) => ({ name: section.name, sort_order: section.sort_order, items: items.filter((item) => item.section_id === section.id).map((item) => ({ item_name: item.item_name, description: item.description, measurement_text: item.measurement_text, unit: item.unit, quantity: Number(item.quantity), amount: Number(item.amount), sort_order: item.sort_order })) })),
    payment_schedule: { title: schedule.title, notes: schedule.notes, basis_amount: Number(schedule.basis_amount), stages: stages.map((stage) => ({ stage_no: stage.stage_no, label: stage.label, description: stage.description, percentage: Number(stage.percentage), amount: Number(stage.amount) })) },
  }
}

function SectionHeading({ number, title }: { number: string; title: string }) {
  return <div className="agreement-section-heading"><span>{number}</span><h2>{title}</h2></div>
}

function TermSection({ section, hideHeading = false }: { section: AgreementTermSection; hideHeading?: boolean }) {
  return <section className="agreement-section agreement-term-section">{!hideHeading && <SectionHeading number={section.number} title={section.title} />}<div className="agreement-clause-list">{section.clauses.map((clause) => <div key={clause.number} className="agreement-clause"><p><strong>{clause.number} {clause.title}.</strong> {clause.text}</p></div>)}</div></section>
}

function PartyCard({ label, name, rows }: { label: string; name: string; rows: Array<string | null> }) {
  return <div className="agreement-party-card"><p>{label}</p><h2>{name}</h2>{rows.filter((row): row is string => Boolean(row)).map((row) => <span key={row}>{row}</span>)}</div>
}

function Particular({ label, value, wide, strong }: { label: string; value: string; wide?: boolean; strong?: boolean }) {
  return <div className={wide ? 'agreement-particular-wide' : ''}><dt>{label}</dt><dd className={strong ? 'agreement-particular-strong' : ''}>{value}</dd></div>
}

function TextCard({ title, value }: { title: string; value: string }) {
  return <div className="agreement-text-card"><h3>{title}</h3><p>{value.trim() || 'Tiada yang dinyatakan.'}</p></div>
}

function SignatureCard({ title, children }: { title: string; children: ReactNode }) {
  return <div className="agreement-signature-card"><h3>{title}</h3>{children}</div>
}

function SignatureLine({ label }: { label: string }) {
  return <div className="agreement-signature-field"><span>{label}</span><i /></div>
}

function SignatureValue({ label, value }: { label: string; value: string }) {
  return <div className="agreement-signature-field"><span>{label}</span><strong>{value}</strong></div>
}

function WitnessBlock() {
  return <div className="agreement-witness"><h4>Disaksikan oleh</h4><SignatureLine label="Tandatangan saksi" /><SignatureLine label="Nama saksi" /><SignatureLine label="No. K/P / Pasport" /><SignatureLine label="Tarikh" /></div>
}

function fullAddress(row: { address_line_1: string | null; address_line_2: string | null; postcode: string | null; city: string | null; state: string }) {
  return [row.address_line_1, row.address_line_2, [row.postcode, row.city].filter(Boolean).join(' '), row.state].filter(Boolean).join(', ') || 'Alamat belum dinyatakan'
}

function formatNumber(value: number) {
  return value.toLocaleString('ms-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function formatLongDate(value: string) {
  const [year = 1970, month = 1, day = 1] = value.slice(0, 10).split('-').map(Number)
  return new Intl.DateTimeFormat('ms-MY', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(year, month - 1, day))
}

function formatOptionalDate(value: string | null) {
  return value ? formatLongDate(value) : 'Akan dipersetujui secara bertulis'
}

function formatLongDateTime(value: string | null) {
  return value ? new Intl.DateTimeFormat('ms-MY', { dateStyle: 'long', timeStyle: 'short' }).format(new Date(value)) : '—'
}
