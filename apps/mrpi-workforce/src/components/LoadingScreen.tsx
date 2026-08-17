export function LoadingScreen({ label = 'Memuatkan...' }: { label?: string }) {
  return (
    <div className="grid min-h-screen place-items-center bg-slate-50 px-6">
      <div className="text-center">
        <div className="mx-auto mb-4 h-9 w-9 animate-spin rounded-full border-4 border-slate-200 border-t-amber-400" />
        <p className="text-sm font-medium text-slate-600">{label}</p>
      </div>
    </div>
  )
}

