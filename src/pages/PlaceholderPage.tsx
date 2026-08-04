import type { LucideIcon } from 'lucide-react'

export function PlaceholderPage({ title, description, milestone, icon: Icon }: { title: string; description: string; milestone: string; icon: LucideIcon }) {
  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
      <div className="grid h-14 w-14 place-items-center rounded-2xl bg-amber-100 text-amber-800">
        <Icon className="h-7 w-7" />
      </div>
      <p className="mt-6 text-sm font-bold text-amber-700">{milestone}</p>
      <h1 className="mt-1 text-2xl font-black tracking-tight sm:text-3xl">{title}</h1>
      <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">{description}</p>
    </section>
  )
}

