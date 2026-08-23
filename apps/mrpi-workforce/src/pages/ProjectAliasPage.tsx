import { BriefcaseBusiness, Check, RotateCcw, Save } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { PageHeader } from '../components/PageHeader'
import { EmptyBlock, ErrorBlock, LoadingBlock } from '../components/State'
import { errorMessage } from '../lib/errors'
import { clearProjectAlias, loadProjects, saveProjectAlias } from '../lib/queries'
import type { Project } from '../types/domain'

export function ProjectAliasPage() {
  const [projects, setProjects] = useState<Project[]>([])
  const [drafts, setDrafts] = useState<Record<number, string>>({})
  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState<number | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  async function refresh() {
    setLoading(true)
    setError('')
    try {
      const loaded = await loadProjects()
      setProjects(loaded)
      setDrafts(Object.fromEntries(loaded.map((project) => [project.id, project.workforce_name ?? ''])))
    } catch (reason) {
      setError(errorMessage(reason))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void refresh() }, [])

  const renamedCount = useMemo(() => projects.filter((project) => project.workforce_name).length, [projects])

  async function save(project: Project) {
    const value = (drafts[project.id] ?? '').trim()
    setSavingId(project.id)
    setError('')
    setNotice('')
    try {
      if (value) await saveProjectAlias(project, value)
      else await clearProjectAlias(project.id)
      await refresh()
      setNotice(value
        ? `Nama Workforce untuk ${project.source_project_no ?? project.project_no} telah ditukar kepada “${value}”.`
        : `Nama Workforce untuk ${project.source_project_no ?? project.project_no} telah dikembalikan kepada kod asal.`)
    } catch (reason) {
      setError(errorMessage(reason))
    } finally {
      setSavingId(null)
    }
  }

  function resetDraft(project: Project) {
    setDrafts((current) => ({ ...current, [project.id]: '' }))
  }

  return <>
    <PageHeader
      eyebrow="Nama paparan Workforce"
      title="Projek"
      description="Tukar nama projek untuk MRPI Workforce sahaja. Kod dan nama asal dalam Contractor Suite tidak berubah."
    />

    <section className="card mb-5 p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-black text-slate-900">{projects.length} projek diselaraskan</p>
          <p className="mt-1 text-xs leading-5 text-slate-500">{renamedCount} projek sedang menggunakan nama khas Workforce.</p>
        </div>
        <div className="rounded-2xl bg-sky-50 px-4 py-3 text-xs font-bold leading-5 text-sky-800">
          Contoh: PRJ-2026-002 → Felda Pemanis 1
        </div>
      </div>
    </section>

    {error && <div className="mb-5"><ErrorBlock message={error} retry={() => void refresh()} /></div>}
    {notice && <p className="alert-success mb-5 flex items-center gap-2"><Check className="h-4 w-4" />{notice}</p>}

    {loading
      ? <LoadingBlock label="Memuatkan projek..." />
      : !projects.length
        ? <EmptyBlock title="Belum ada projek" description="Projek akan muncul di sini selepas tersedia dalam Contractor Suite." />
        : <div className="space-y-4">{projects.map((project) => {
          const originalCode = project.source_project_no ?? project.project_no
          const draft = drafts[project.id] ?? ''
          const hasAlias = Boolean(project.workforce_name)
          const changed = draft.trim() !== (project.workforce_name ?? '')
          const busy = savingId === project.id

          return <article key={project.id} className="card overflow-hidden">
            <div className="flex items-start gap-3 border-b border-slate-100 bg-slate-50/70 p-4 sm:p-5">
              <span className="mt-0.5 rounded-xl bg-white p-2 text-sky-700 shadow-sm"><BriefcaseBusiness className="h-5 w-5" /></span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-xs font-black uppercase tracking-wider text-slate-500">{originalCode}</p>
                  {hasAlias && <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-black text-emerald-700">Nama Workforce aktif</span>}
                </div>
                <h2 className="mt-1 truncate text-base font-black text-slate-950">{project.project_name}</h2>
                {project.client_name && <p className="mt-1 truncate text-xs text-slate-500">{project.client_name}</p>}
              </div>
            </div>

            <div className="p-4 sm:p-5">
              <label>
                <span className="field-label">Nama dalam MRPI Workforce</span>
                <input
                  className="field-control"
                  value={draft}
                  maxLength={120}
                  placeholder="Contoh: Felda Pemanis 1"
                  onChange={(event) => setDrafts((current) => ({ ...current, [project.id]: event.target.value }))}
                />
              </label>
              <p className="mt-2 text-xs leading-5 text-slate-500">Jika diisi, nama ini menggantikan paparan kod <strong>{originalCode}</strong> di attendance, upah, sejarah dan report pekerja.</p>

              <div className="mt-4 flex flex-wrap justify-end gap-2">
                {hasAlias && <button type="button" className="btn-secondary" onClick={() => resetDraft(project)} disabled={busy}>
                  <RotateCcw className="h-4 w-4" />Guna kod asal
                </button>}
                <button type="button" className="btn-primary" onClick={() => void save(project)} disabled={busy || !changed}>
                  <Save className="h-4 w-4" />{busy ? 'Menyimpan...' : 'Simpan nama'}
                </button>
              </div>
            </div>
          </article>
        })}</div>}
  </>
}
