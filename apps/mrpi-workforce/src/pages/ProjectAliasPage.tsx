import { CalendarDays } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'wouter'
import { PageHeader } from '../components/PageHeader'
import { EmptyBlock, ErrorBlock, LoadingBlock } from '../components/State'
import { errorMessage } from '../lib/errors'
import { loadProjects } from '../lib/queries'
import type { Project } from '../types/domain'

export function ProjectAliasPage() {
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  async function refresh() {
    setLoading(true)
    setError('')
    try {
      setProjects(await loadProjects())
    } catch (reason) {
      setError(errorMessage(reason))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void refresh() }, [])

  return <>
    <PageHeader
      eyebrow="Projek Workforce"
      title="Projek"
      description="Project Alias diurus dalam MRPI Contractor Suite dan digunakan automatik di sini."
    />

    {error && <div className="mb-5"><ErrorBlock message={error} retry={() => void refresh()} /></div>}

    {loading
      ? <LoadingBlock label="Memuatkan projek..." />
      : !projects.length
        ? <EmptyBlock title="Belum ada projek" description="Projek akan muncul selepas tersedia dalam Contractor Suite." />
        : <div className="space-y-3">{projects.map((project) => <article key={project.id} className="card flex items-center justify-between gap-4 p-4 sm:p-5">
          <div className="min-w-0">
            <h2 className="truncate text-lg font-black text-slate-950">{project.workforce_name || project.project_no}</h2>
            {!project.workforce_name && <p className="mt-1 text-xs font-semibold text-amber-700">Alias belum ditetapkan</p>}
          </div>
          <Link href={`/projects/${project.id}/calendar`} className="btn-secondary shrink-0">
            <CalendarDays className="h-4 w-4" />Kalendar tapak
          </Link>
        </article>)}</div>}
  </>
}
