import { CalendarDays, CheckCircle2, Clock3, FolderKanban, Search, Tags, WalletCards } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'wouter'
import { useAuth } from '../auth/AuthProvider'
import { formatMoney } from '../lib/quotation'
import {
  formatProjectDate,
  projectAddress,
  projectStatusLabel,
  projectStatusTone,
  type Project,
} from '../lib/project'
import { supabase } from '../lib/supabase'

type StatusFilter = 'all' | 'preparation' | 'scheduled' | 'active' | 'work_completed' | 'handed_over'

const filters: Array<[StatusFilter, string]> = [
  ['all', 'Semua'],
  ['preparation', 'Persediaan'],
  ['scheduled', 'Dijadualkan'],
  ['active', 'Aktif'],
  ['work_completed', 'Siap Kerja'],
  ['handed_over', 'Diserahkan'],
]

export function ProjectListPage() {
  const { user } = useAuth()
  const [companyId, setCompanyId] = useState<number | null>(null)
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')

  useEffect(() => {
    if (!supabase || !user) return
    const client = supabase
    const currentUser = user
    let mounted = true

    async function loadProjects() {
      setLoading(true)
      setError('')
      const { data: company, error: companyError } = await client
        .from('companies')
        .select('id')
        .eq('owner_user_id', currentUser.id)
        .maybeSingle()

      if (!mounted) return
      if (companyError || !company) {
        setError(companyError?.message ?? '')
        setLoading(false)
        return
      }
      setCompanyId(company.id)

      const { data, error: projectError } = await client
        .from('projects')
        .select('*')
        .eq('company_id', company.id)
        .order('updated_at', { ascending: false })
        .order('id', { ascending: false })

      if (!mounted) return
      if (projectError) setError(projectError.message)
      else setProjects(data ?? [])
      setLoading(false)
    }

    void loadProjects()
    return () => { mounted = false }
  }, [user])

  const visible = useMemo(() => {
    const query = search.trim().toLocaleLowerCase('ms-MY')
    return projects.filter((project) => {
      if (statusFilter !== 'all' && project.status !== statusFilter) return false
      if (!query) return true
      return [
        project.project_no,
        project.project_name,
        project.quotation_no,
        project.client_name,
        project.client_phone,
        projectAddress(project),
      ].some((value) => value.toLocaleLowerCase('ms-MY').includes(query))
    })
  }, [projects, search, statusFilter])

  if (loading) return <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600">Memuatkan projek...</div>
  if (!companyId && !error) return <section className="rounded-3xl border border-amber-200 bg-amber-50 p-6"><h1 className="text-xl font-black">Lengkapkan profil dahulu</h1><Link href="/profil" className="mt-4 inline-flex min-h-11 items-center rounded-xl bg-slate-950 px-4 text-sm font-black text-white">Buka Profil Syarikat</Link></section>

  const preparingCount = projects.filter((project) => project.status === 'preparation' || project.status === 'scheduled').length
  const activeCount = projects.filter((project) => project.status === 'active').length
  const completedCount = projects.filter((project) => project.status === 'work_completed' || project.status === 'handed_over').length

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-bold text-amber-700">Daripada sebutharga diterima</p>
          <h1 className="mt-1 text-2xl font-black tracking-tight sm:text-3xl">Pengurusan Projek</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">Setiap projek bermula daripada sebutharga yang diterima. Skop dan nilai kontrak asal kekal dikunci sebagai baseline projek.</p>
        </div>
        <Link href="/projek-alias" className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-700 shadow-sm hover:bg-slate-50"><Tags className="h-4 w-4" />Project Alias</Link>
      </header>

      {error && <p role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">{error}</p>}

      <section className="grid grid-cols-3 gap-3" aria-label="Ringkasan projek">
        <Summary icon={<Clock3 />} value={preparingCount} label="Persediaan" tone="bg-amber-100 text-amber-800" />
        <Summary icon={<FolderKanban />} value={activeCount} label="Aktif" tone="bg-emerald-100 text-emerald-800" />
        <Summary icon={<CheckCircle2 />} value={completedCount} label="Selesai" tone="bg-slate-200 text-slate-800" />
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="relative"><Search className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" /><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} className="field-control pl-11" placeholder="Cari no. projek, pelanggan atau alamat" /></div>
        <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
          {filters.map(([value, label]) => <button key={value} type="button" onClick={() => setStatusFilter(value)} className={`min-h-10 shrink-0 rounded-full px-4 text-xs font-black ${statusFilter === value ? 'bg-slate-950 text-white' : 'bg-slate-100 text-slate-600'}`}>{label}</button>)}
        </div>
      </section>

      {visible.length ? (
        <section className="grid gap-3 md:grid-cols-2">
          {visible.map((project) => (
            <Link key={project.id} href={`/projek/${project.id}`} className="group rounded-3xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-amber-300 hover:shadow-md sm:p-5">
              <div className="flex items-start justify-between gap-3">
                <div><span className={`rounded-full px-2.5 py-1 text-[10px] font-black ${projectStatusTone(project.status)}`}>{projectStatusLabel(project.status)}</span><p className="mt-3 text-lg font-black tracking-tight">{project.project_no}</p></div>
                <div className="grid h-11 w-11 place-items-center rounded-xl bg-slate-100 text-slate-500 group-hover:bg-amber-100 group-hover:text-amber-800"><FolderKanban className="h-5 w-5" /></div>
              </div>
              <p className="mt-3 font-black text-slate-950">{project.client_name}</p>
              <p className="mt-1 line-clamp-2 text-sm font-semibold leading-6 text-slate-700">{project.project_name}</p>
              <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">{projectAddress(project)}</p>
              <div className="mt-4 flex items-end justify-between gap-3 border-t border-slate-100 pt-4"><p className="flex items-center gap-1.5 text-xs font-semibold text-slate-400"><CalendarDays className="h-4 w-4" />{formatProjectDate(project.planned_start_date)}</p><div className="text-right"><p className="text-[10px] font-bold text-slate-400">Kontrak semasa</p><p className="mt-1 flex items-center gap-1.5 text-lg font-black"><WalletCards className="h-4 w-4 text-slate-400" />{formatMoney(Number(project.current_contract_amount))}</p></div></div>
            </Link>
          ))}
        </section>
      ) : (
        <section className="rounded-3xl border-2 border-dashed border-slate-200 bg-white px-6 py-12 text-center">
          <FolderKanban className="mx-auto h-10 w-10 text-slate-300" />
          <h2 className="mt-4 font-black">{projects.length ? 'Tiada projek sepadan' : 'Belum ada projek'}</h2>
          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500">{projects.length ? 'Ubah carian atau penapis.' : 'Buka sebutharga berstatus Diterima dan tekan “Teruskan Sebagai Projek”. Projek tidak boleh dicipta secara berasingan.'}</p>
          {!projects.length && <Link href="/sebutharga" className="mt-5 inline-flex min-h-11 items-center rounded-xl bg-slate-950 px-4 text-sm font-black text-white">Buka Senarai Sebutharga</Link>}
        </section>
      )}
    </div>
  )
}

function Summary({ icon, value, label, tone }: { icon: React.ReactNode; value: number; label: string; tone: string }) {
  return <article className="rounded-2xl border border-slate-200 bg-white p-3.5 shadow-sm"><div className={`grid h-9 w-9 place-items-center rounded-xl [&>svg]:h-4.5 [&>svg]:w-4.5 ${tone}`}>{icon}</div><p className="mt-3 text-2xl font-black">{value}</p><p className="mt-1 text-[11px] font-bold text-slate-500">{label}</p></article>
}
