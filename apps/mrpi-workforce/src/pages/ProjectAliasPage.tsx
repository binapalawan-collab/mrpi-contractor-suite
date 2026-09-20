import { CalendarDays, Save, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'wouter'
import { PageHeader } from '../components/PageHeader'
import { EmptyBlock, ErrorBlock, LoadingBlock } from '../components/State'
import { errorMessage } from '../lib/errors'
import { loadProjects, updateProjectAlias } from '../lib/queries'
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
      const rows = await loadProjects()
      setProjects(rows)
      setDrafts(Object.fromEntries(rows.map((project) => [project.id, project.workforce_name || ''])))
    } catch (reason) {
      setError(errorMessage(reason))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void refresh() }, [])

  async function save(project: Project, value = drafts[project.id] || '') {
    setSavingId(project.id)
    setError('')
    setNotice('')
    try {
      await updateProjectAlias(project.id, value)
      const clean = value.trim()
      setProjects((current) => current.map((item) => item.id === project.id
        ? { ...item, workforce_name: clean || null, project_no: clean || item.source_project_no || item.project_no }
        : item))
      setDrafts((current) => ({ ...current, [project.id]: clean }))
      setNotice(clean ? `Alias “${clean}” telah disimpan.` : 'Alias telah dikosongkan.')
    } catch (reason) {
      setError(errorMessage(reason))
    } finally {
      setSavingId(null)
    }
  }

  return <>
    <PageHeader
      eyebrow="Tetapan Workforce"
      title="Alias Projek"
      description="Tetapkan nama pendek supaya nama projek yang panjang lebih mudah dikenal pasti di seluruh Workforce."
    />

    {notice && <div className="mb-5 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-800">{notice}</div>}
    {error && <div className="mb-5"><ErrorBlock message={error} retry={() => void refresh()} /></div>}

    {loading
      ? <LoadingBlock label="Memuatkan projek..." />
      : !projects.length
        ? <EmptyBlock title="Belum ada projek" description="Projek akan muncul selepas tersedia dalam Contractor Suite." />
        : <div className="space-y-4">{projects.map((project) => {
          const originalAlias = project.workforce_name || ''
          const draft = drafts[project.id] ?? ''
          const unchanged = draft.trim() === originalAlias
          return <article key={project.id} className="card p-4 sm:p-5">
            <div className="mb-4 min-w-0">
              <p className="text-xs font-black uppercase tracking-wide text-sky-700">{project.source_project_no || project.project_no}</p>
              <h2 className="mt-1 text-base font-black leading-snug text-slate-950">{project.project_name}</h2>
              {project.client_name && <p className="mt-1 text-sm font-semibold text-slate-500">{project.client_name}</p>}
            </div>

            <label className="block text-sm font-black text-slate-800" htmlFor={`alias-${project.id}`}>Nama pendek / alias</label>
            <input
              id={`alias-${project.id}`}
              value={draft}
              maxLength={80}
              onChange={(event) => setDrafts((current) => ({ ...current, [project.id]: event.target.value }))}
              placeholder="Contoh: IOI, Segamat Baru, Rumah Along"
              className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-base font-bold outline-none transition focus:border-sky-500 focus:ring-4 focus:ring-sky-100"
            />
            <p className="mt-2 text-xs font-medium text-slate-500">Kosongkan ruangan jika mahu guna nombor projek asal.</p>

            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void save(project)}
                disabled={savingId === project.id || unchanged}
                className="btn-primary disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Save className="h-4 w-4" />{savingId === project.id ? 'Menyimpan...' : 'Simpan alias'}
              </button>
              {originalAlias && <button
                type="button"
                onClick={() => {
                  setDrafts((current) => ({ ...current, [project.id]: '' }))
                  void save(project, '')
                }}
                disabled={savingId === project.id}
                className="btn-secondary text-rose-700"
              >
                <Trash2 className="h-4 w-4" />Buang alias
              </button>}
              <Link href={`/projects/${project.id}/calendar`} className="btn-secondary">
                <CalendarDays className="h-4 w-4" />Kalendar tapak
              </Link>
            </div>
          </article>
        })}</div>}
  </>
}
