import { Check, Save } from 'lucide-react'
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

type AliasProject = {
  id: number
  project_no: string
  project_alias: string | null
}

export function ProjectAliasPage() {
  const [projects, setProjects] = useState<AliasProject[]>([])
  const [drafts, setDrafts] = useState<Record<number, string>>({})
  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState<number | null>(null)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')

  async function load() {
    if (!supabase) return
    setLoading(true)
    setError('')
    try {
      const client = supabase as any
      const { data, error: loadError } = await client
        .from('projects')
        .select('id,project_no,project_alias')
        .order('updated_at', { ascending: false })
      if (loadError) throw loadError
      const rows = (data ?? []) as AliasProject[]
      setProjects(rows)
      setDrafts(Object.fromEntries(rows.map((project) => [project.id, project.project_alias ?? ''])))
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Project Alias tidak dapat dimuatkan.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [])

  async function save(project: AliasProject) {
    if (!supabase) return
    const value = (drafts[project.id] ?? '').trim()
    setSavingId(project.id)
    setNotice('')
    setError('')
    try {
      const client = supabase as any
      const { error: saveError } = await client
        .from('projects')
        .update({ project_alias: value || null })
        .eq('id', project.id)
      if (saveError) throw saveError
      await load()
      setNotice(value ? `Alias disimpan: ${value}` : 'Alias dibuang.')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Project Alias tidak dapat disimpan.')
    } finally {
      setSavingId(null)
    }
  }

  return <div className="mx-auto max-w-3xl space-y-5">
    <header>
      <p className="text-sm font-bold text-amber-700">Projek</p>
      <h1 className="mt-1 text-2xl font-black tracking-tight sm:text-3xl">Project Alias</h1>
      <p className="mt-2 text-sm text-slate-500">Nama pendek ini digunakan bersama dalam Workforce dan Project Expenses.</p>
    </header>

    {error && <p role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">{error}</p>}
    {notice && <p className="flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-bold text-emerald-800"><Check className="h-4 w-4" />{notice}</p>}

    {loading ? <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500">Memuatkan...</div> :
      <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        {projects.map((project, index) => {
          const draft = drafts[project.id] ?? ''
          const changed = draft.trim() !== (project.project_alias ?? '')
          const busy = savingId === project.id
          return <div key={project.id} className={`p-4 sm:p-5 ${index ? 'border-t border-slate-100' : ''}`}>
            <p className="mb-2 text-[11px] font-black uppercase tracking-wider text-slate-400">{project.project_no}</p>
            <div className="flex gap-2">
              <input
                className="field-control flex-1"
                value={draft}
                maxLength={120}
                placeholder="Contoh: Felda Pemanis 1"
                onChange={(event) => setDrafts((current) => ({ ...current, [project.id]: event.target.value }))}
              />
              <button
                type="button"
                className="inline-flex min-h-12 shrink-0 items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 text-sm font-black text-white disabled:opacity-40"
                disabled={busy || !changed}
                onClick={() => void save(project)}
              >
                <Save className="h-4 w-4" />{busy ? '...' : 'Simpan'}
              </button>
            </div>
          </div>
        })}
        {!projects.length && <p className="p-6 text-center text-sm text-slate-500">Belum ada projek.</p>}
      </section>}
  </div>
}
