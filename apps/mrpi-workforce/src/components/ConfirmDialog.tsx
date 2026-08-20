import { AlertTriangle } from 'lucide-react'

export function ConfirmDialog({
  title,
  description,
  confirmLabel,
  busy = false,
  onCancel,
  onConfirm,
}: {
  title: string
  description: string
  confirmLabel: string
  busy?: boolean
  onCancel: () => void
  onConfirm: () => void
}) {
  return <div
    className="fixed inset-0 z-50 grid place-items-end bg-slate-950/55 backdrop-blur-sm sm:place-items-center sm:p-6"
    role="presentation"
    onMouseDown={() => !busy && onCancel()}
  >
    <section
      className="w-full rounded-t-3xl bg-white p-5 shadow-2xl sm:max-w-md sm:rounded-3xl"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="confirm-title"
      onMouseDown={(event) => event.stopPropagation()}
    >
      <div className="grid h-11 w-11 place-items-center rounded-2xl bg-rose-50 text-rose-600">
        <AlertTriangle className="h-5 w-5" />
      </div>
      <h2 id="confirm-title" className="mt-4 text-xl font-black">{title}</h2>
      <p className="mt-2 text-sm leading-6 text-slate-600">{description}</p>
      <div className="mt-6 grid grid-cols-2 gap-3">
        <button type="button" className="btn-secondary" disabled={busy} onClick={onCancel}>Batal</button>
        <button
          type="button"
          className="inline-flex min-h-11 items-center justify-center rounded-xl bg-rose-600 px-4 text-sm font-black text-white disabled:opacity-60"
          disabled={busy}
          onClick={onConfirm}
        >
          {busy ? 'Memproses...' : confirmLabel}
        </button>
      </div>
    </section>
  </div>
}
