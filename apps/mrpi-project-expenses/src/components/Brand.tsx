import { Link } from 'wouter'

export function Brand({ compact = false }: { compact?: boolean }) {
  return <Link href="/" className="inline-flex items-center gap-3 rounded-lg" aria-label="MRPI Project Expenses">
    <img src="/mrpi-expenses-icon-v2.svg" alt="" className="h-10 w-10 rounded-xl shadow-sm" />
    {!compact && <span className="leading-tight"><span className="block text-sm font-black tracking-[0.16em] text-slate-950">MRPI</span><span className="block text-xs font-semibold text-emerald-700">Project Expenses</span></span>}
  </Link>
}
