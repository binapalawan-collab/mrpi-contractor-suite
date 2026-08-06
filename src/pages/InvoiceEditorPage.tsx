import {
  AlertTriangle,
  ArrowLeft,
  Banknote,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  CircleDollarSign,
  FileDown,
  MessageCircle,
  Plus,
  ReceiptText,
  Save,
  Send,
  Trash2,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation } from 'wouter'
import { useAuth } from '../auth/AuthProvider'
import {
  buildInvoiceWhatsAppText,
  formatInvoiceDate,
  invoiceDraftFromRows,
  invoiceDraftTotal,
  invoiceSourceLabel,
  invoiceStatusLabel,
  invoiceStatusTone,
  paymentMethodLabel,
  progressAmount,
  todayIso,
  validateInvoiceDraft,
  type Invoice,
  type InvoiceDraft,
  type InvoiceDraftItem,
  type InvoiceItem,
  type InvoicePayment,
  type PaymentMethod,
} from '../lib/invoice'
import { clearInvoiceDraft, readInvoiceDraft, saveInvoiceDraft } from '../lib/invoiceDrafts'
import { projectAddress, type Project } from '../lib/project'
import { formatMoney, parsePositiveNumber, whatsappNumber } from '../lib/quotation'
import { supabase } from '../lib/supabase'
import type { VariationOrder } from '../lib/variationOrder'
import type { Json } from '../types/database'

type ComposerMode = 'progress' | 'approved_variation' | 'manual'

export function InvoiceEditorPage({ projectId, invoiceId }: { projectId: string; invoiceId: string }) {
  const { user } = useAuth()
  const [, navigate] = useLocation()
  const [project, setProject] = useState<Project | null>(null)
  const [invoice, setInvoice] = useState<Invoice | null>(null)
  const [draft, setDraft] = useState<InvoiceDraft | null>(null)
  const [projectInvoices, setProjectInvoices] = useState<Invoice[]>([])
  const [projectInvoiceItems, setProjectInvoiceItems] = useState<InvoiceItem[]>([])
  const [variationOrders, setVariationOrders] = useState<VariationOrder[]>([])
  const [payments, setPayments] = useState<InvoicePayment[]>([])
  const [loading, setLoading] = useState(true)
  const [hydrated, setHydrated] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [autosaveLabel, setAutosaveLabel] = useState('')

  const [composerMode, setComposerMode] = useState<ComposerMode>('progress')
  const [composerDescription, setComposerDescription] = useState('')
  const [composerPercentage, setComposerPercentage] = useState('10')
  const [composerAmount, setComposerAmount] = useState('')
  const [composerVariationId, setComposerVariationId] = useState('')

  const [paymentDate, setPaymentDate] = useState(todayIso())
  const [paymentAmount, setPaymentAmount] = useState('')
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('bank_transfer')
  const [paymentReference, setPaymentReference] = useState('')
  const [paymentNotes, setPaymentNotes] = useState('')

  const draftRef = useRef<InvoiceDraft | null>(null)
  const saveChainRef = useRef<Promise<unknown>>(Promise.resolve())

  useEffect(() => {
    if (!supabase || !user) return
    const numericProjectId = Number(projectId)
    const numericInvoiceId = Number(invoiceId)
    if (!Number.isInteger(numericProjectId) || numericProjectId <= 0 || !Number.isInteger(numericInvoiceId) || numericInvoiceId <= 0) {
      setError('ID projek atau invois tidak sah.')
      setLoading(false)
      return
    }
    const client = supabase
    const currentUser = user
    let mounted = true

    async function loadInvoice() {
      setLoading(true)
      setError('')
      const { data: company, error: companyError } = await client.from('companies').select('id').eq('owner_user_id', currentUser.id).maybeSingle()
      if (!mounted) return
      if (companyError || !company) {
        setError(companyError?.message ?? 'Profil syarikat tidak ditemui.')
        setLoading(false)
        return
      }

      const [projectResult, invoiceResult, itemResult, allInvoiceResult, allItemResult, variationResult, paymentResult] = await Promise.all([
        client.from('projects').select('*').eq('id', numericProjectId).eq('company_id', company.id).maybeSingle(),
        client.from('invoices').select('*').eq('id', numericInvoiceId).eq('project_id', numericProjectId).eq('company_id', company.id).maybeSingle(),
        client.from('invoice_items').select('*').eq('invoice_id', numericInvoiceId).eq('project_id', numericProjectId).eq('company_id', company.id).order('sort_order').order('id'),
        client.from('invoices').select('*').eq('project_id', numericProjectId).eq('company_id', company.id).order('invoice_date').order('id'),
        client.from('invoice_items').select('*').eq('project_id', numericProjectId).eq('company_id', company.id),
        client.from('variation_orders').select('*').eq('project_id', numericProjectId).eq('company_id', company.id).eq('status', 'approved').order('approved_at').order('id'),
        client.from('invoice_payments').select('*').eq('invoice_id', numericInvoiceId).eq('project_id', numericProjectId).eq('company_id', company.id).order('payment_date').order('id'),
      ])
      if (!mounted) return
      const loadError = projectResult.error ?? invoiceResult.error ?? itemResult.error ?? allInvoiceResult.error ?? allItemResult.error ?? variationResult.error ?? paymentResult.error
      if (loadError || !projectResult.data || !invoiceResult.data) {
        setError(loadError?.message ?? 'Invois tidak ditemui.')
        setLoading(false)
        return
      }

      const databaseDraft = invoiceDraftFromRows(invoiceResult.data, itemResult.data ?? [])
      const localDraft = invoiceResult.data.status === 'draft' ? readInvoiceDraft(currentUser.id, numericInvoiceId) : null
      const restoredDraft = localDraft && localDraft.project_id === numericProjectId && localDraft.saved_at > invoiceResult.data.updated_at
        ? localDraft
        : databaseDraft

      if (localDraft && restoredDraft === databaseDraft) clearInvoiceDraft(currentUser.id, numericInvoiceId)
      if (restoredDraft === localDraft) setNotice('Draf terakhir daripada telefon dipulihkan selepas pertukaran app.')
      setProject(projectResult.data)
      setInvoice(invoiceResult.data)
      setDraft(restoredDraft)
      setProjectInvoices(allInvoiceResult.data ?? [])
      setProjectInvoiceItems(allItemResult.data ?? [])
      setVariationOrders(variationResult.data ?? [])
      setPayments(paymentResult.data ?? [])
      setPaymentAmount(Number(invoiceResult.data.balance_amount).toFixed(2))
      setHydrated(true)
      setLoading(false)
    }

    void loadInvoice()
    return () => { mounted = false }
  }, [invoiceId, projectId, user])

  useEffect(() => {
    draftRef.current = draft
    if (!draft || !user || !hydrated || draft.status !== 'draft') return
    saveInvoiceDraft(user.id, draft.invoice_id, draft)
    setAutosaveLabel('Disimpan pada telefon')

    const timer = window.setTimeout(() => {
      if (!isServerPersistable(draft)) return
      void queuePersist(draft).then(() => setAutosaveLabel('Semua perubahan disimpan')).catch(() => setAutosaveLabel('Disimpan pada telefon; server akan cuba semula'))
    }, 900)
    return () => window.clearTimeout(timer)
  }, [draft, hydrated, user])

  useEffect(() => {
    function checkpoint() {
      if (user && draftRef.current?.status === 'draft') saveInvoiceDraft(user.id, draftRef.current.invoice_id, draftRef.current)
    }
    function onVisibility() {
      if (document.visibilityState === 'hidden') checkpoint()
    }
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('pagehide', checkpoint)
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('pagehide', checkpoint)
    }
  }, [user])

  const invoiceStatusMap = useMemo(() => new Map(projectInvoices.map((row) => [row.id, row.status])), [projectInvoices])
  const previousBilled = useMemo(() => projectInvoices.reduce((total, row) => row.id !== invoice?.id && row.status !== 'draft' && row.status !== 'void' ? total + Number(row.total_amount) : total, 0), [invoice?.id, projectInvoices])
  const currentTotal = draft ? invoiceDraftTotal(draft) : 0
  const contractValue = Number(project?.current_contract_amount ?? 0)
  const availableToBill = Math.max(0, contractValue - previousBilled)
  const approvedVoRemaining = useMemo(() => {
    const claims = new Map<number, number>()
    for (const item of projectInvoiceItems) {
      if (!item.variation_order_id || item.invoice_id === invoice?.id) continue
      const status = invoiceStatusMap.get(item.invoice_id)
      if (status === 'issued' || status === 'partially_paid' || status === 'paid') claims.set(item.variation_order_id, (claims.get(item.variation_order_id) ?? 0) + Number(item.amount))
    }
    return new Map(variationOrders.map((order) => [order.id, Math.max(0, Number(order.net_amount) - (claims.get(order.id) ?? 0))]))
  }, [invoice?.id, invoiceStatusMap, projectInvoiceItems, variationOrders])

  function queuePersist(targetDraft: InvoiceDraft) {
    const task = saveChainRef.current.then(() => persistDraft(targetDraft))
    saveChainRef.current = task.catch(() => undefined)
    return task
  }

  async function persistDraft(targetDraft: InvoiceDraft) {
    if (!supabase) throw new Error('Sambungan database tidak tersedia.')
    const items = targetDraft.items.map((item, sortOrder) => ({
      variation_order_id: item.variation_order_id,
      source_type: item.source_type,
      description: item.description.trim(),
      percentage: item.source_type === 'progress' ? Number(item.percentage) : null,
      amount: Number(item.amount),
      sort_order: sortOrder,
    }))
    const { data, error: saveError } = await supabase.rpc('save_project_invoice_draft', {
      p_invoice_id: targetDraft.invoice_id,
      p_invoice_date: targetDraft.invoice_date,
      p_due_date: targetDraft.due_date || null,
      p_title: targetDraft.title.trim(),
      p_notes: targetDraft.notes,
      p_items: items as unknown as Json,
    })
    if (saveError) throw saveError
    return data
  }

  function patchDraft(patch: Partial<InvoiceDraft>) {
    setDraft((current) => current ? { ...current, ...patch } : current)
  }

  function patchItem(localId: string, patch: Partial<InvoiceDraftItem>) {
    setDraft((current) => current ? { ...current, items: current.items.map((item) => item.local_id === localId ? { ...item, ...patch } : item) } : current)
  }

  function addClaim() {
    if (!draft || !project) return
    setError('')
    let item: InvoiceDraftItem
    if (composerMode === 'progress') {
      const percentage = parsePositiveNumber(composerPercentage)
      const amount = parsePositiveNumber(composerAmount || String(progressAmount(contractValue, composerPercentage)))
      if (percentage === null || percentage > 100 || amount === null) {
        setError('Isi peratus progress antara 0.001% hingga 100% dan jumlah yang sah.')
        return
      }
      item = {
        local_id: crypto.randomUUID(), id: null, variation_order_id: null, source_type: 'progress',
        description: composerDescription.trim() || `Tuntutan progress ${percentage}%`, percentage: String(percentage), amount: amount.toFixed(2),
      }
    } else if (composerMode === 'approved_variation') {
      const variationId = Number(composerVariationId)
      const order = variationOrders.find((row) => row.id === variationId)
      const amount = parsePositiveNumber(composerAmount)
      if (!order || amount === null) {
        setError('Pilih VO yang diluluskan dan isi jumlah tuntutan.')
        return
      }
      if (amount > (approvedVoRemaining.get(order.id) ?? 0)) {
        setError('Jumlah ini melebihi baki VO yang belum dituntut.')
        return
      }
      item = {
        local_id: crypto.randomUUID(), id: null, variation_order_id: order.id, source_type: 'approved_variation',
        description: composerDescription.trim() || `${order.vo_no} — ${order.title}`, percentage: '', amount: amount.toFixed(2),
      }
    } else {
      const amount = parsePositiveNumber(composerAmount)
      if (!composerDescription.trim() || amount === null) {
        setError('Isi keterangan dan jumlah tuntutan manual.')
        return
      }
      item = {
        local_id: crypto.randomUUID(), id: null, variation_order_id: null, source_type: 'manual',
        description: composerDescription.trim(), percentage: '', amount: amount.toFixed(2),
      }
    }
    patchDraft({ items: [...draft.items, item] })
    setComposerDescription('')
    setComposerAmount('')
    setComposerPercentage('10')
    setComposerVariationId('')
  }

  async function saveManually() {
    if (!draft || !invoice || !user) return
    const validation = validateInvoiceDraft(draft)
    if (validation) {
      setError(validation)
      return
    }
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const saved = await queuePersist(draft)
      setInvoice(saved)
      const local = saveInvoiceDraft(user.id, invoice.id, { ...draft, saved_at: saved.updated_at })
      if (local) setDraft(local)
      setAutosaveLabel('Semua perubahan disimpan')
      setNotice('Draf invois berjaya disimpan.')
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Draf invois tidak dapat disimpan.')
    } finally {
      setBusy(false)
    }
  }

  async function issueInvoice() {
    if (!supabase || !draft || !invoice || !user) return
    const validation = validateInvoiceDraft(draft)
    if (validation) {
      setError(validation)
      return
    }
    if (currentTotal > availableToBill) {
      setError(`Jumlah invois melebihi baki kontrak yang boleh dituntut (${formatMoney(availableToBill)}).`)
      return
    }
    if (!window.confirm(`Keluarkan ${invoice.invoice_no} bernilai ${formatMoney(currentTotal)}? Selepas ini invois dan item akan dikunci.`)) return
    setBusy(true)
    setError('')
    setNotice('')
    try {
      await queuePersist(draft)
      const { data, error: issueError } = await supabase.rpc('issue_project_invoice', { p_invoice_id: invoice.id })
      if (issueError) throw issueError
      clearInvoiceDraft(user.id, invoice.id)
      setInvoice(data)
      setDraft((current) => current ? { ...current, status: data.status, saved_at: data.updated_at } : current)
      setPaymentAmount(Number(data.balance_amount).toFixed(2))
      setNotice('Invois telah dikeluarkan dan dikunci. Ia kini sedia dihantar atau menerima bayaran.')
      setAutosaveLabel('')
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Invois tidak dapat dikeluarkan.')
    } finally {
      setBusy(false)
    }
  }

  async function voidInvoice() {
    if (!supabase || !invoice || !user) return
    if (!window.confirm(`Batalkan ${invoice.invoice_no}? Rekod kekal dalam sistem tetapi tidak lagi dikira dalam tuntutan.`)) return
    setBusy(true)
    setError('')
    try {
      const { data, error: voidError } = await supabase.rpc('void_project_invoice', { p_invoice_id: invoice.id })
      if (voidError) throw voidError
      clearInvoiceDraft(user.id, invoice.id)
      setInvoice(data)
      setDraft((current) => current ? { ...current, status: data.status } : current)
      setNotice('Invois telah dibatalkan. Tiada rekod dipadam.')
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Invois tidak dapat dibatalkan.')
    } finally {
      setBusy(false)
    }
  }

  async function recordPayment() {
    if (!supabase || !invoice) return
    const amount = parsePositiveNumber(paymentAmount)
    if (amount === null) {
      setError('Jumlah bayaran mesti lebih besar daripada sifar.')
      return
    }
    if (amount > Number(invoice.balance_amount)) {
      setError(`Bayaran melebihi baki invois (${formatMoney(Number(invoice.balance_amount))}).`)
      return
    }
    if (!window.confirm(`Rekod bayaran ${formatMoney(amount)} untuk ${invoice.invoice_no}? Resit akan dijana dan rekod tidak boleh diedit.`)) return
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const { data: payment, error: paymentError } = await supabase.rpc('record_invoice_payment', {
        p_invoice_id: invoice.id,
        p_payment_date: paymentDate,
        p_amount: amount,
        p_payment_method: paymentMethod,
        p_reference_no: paymentReference.trim() || null,
        p_notes: paymentNotes,
      })
      if (paymentError) throw paymentError
      const { data: refreshed, error: refreshError } = await supabase.from('invoices').select('*').eq('id', invoice.id).single()
      if (refreshError) throw refreshError
      setInvoice(refreshed)
      setPayments((current) => [...current, payment])
      setPaymentAmount(Number(refreshed.balance_amount).toFixed(2))
      setPaymentReference('')
      setPaymentNotes('')
      setNotice(`Bayaran direkodkan. Resit ${payment.receipt_no} telah dijana.`)
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Bayaran tidak dapat direkodkan.')
    } finally {
      setBusy(false)
    }
  }

  async function openPrint() {
    if (!draft || !invoice || !project) return
    if (invoice.status === 'draft') {
      const validation = validateInvoiceDraft(draft)
      if (validation) {
        setError(validation)
        return
      }
      setBusy(true)
      try {
        await queuePersist(draft)
      } catch (caughtError) {
        setError(caughtError instanceof Error ? caughtError.message : 'Draf tidak dapat disimpan sebelum cetak.')
        setBusy(false)
        return
      }
      setBusy(false)
    }
    navigate(`/projek/${project.id}/invois/${invoice.id}/cetak`)
  }

  function openWhatsApp() {
    if (!invoice || !project || invoice.status === 'draft') return
    const phone = whatsappNumber(project.client_phone)
    if (!phone) {
      setError('Nombor telefon pelanggan tidak sah untuk WhatsApp.')
      return
    }
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(buildInvoiceWhatsAppText(invoice, project))}`, '_blank', 'noopener,noreferrer')
  }

  if (loading) return <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600">Memuatkan invois...</div>
  if (!project || !invoice || !draft) return <section className="rounded-3xl border border-red-200 bg-red-50 p-6"><AlertTriangle className="h-8 w-8 text-red-700" /><h1 className="mt-4 text-xl font-black">Invois tidak dapat dibuka</h1><p role="alert" className="mt-2 text-sm text-red-700">{error || 'Rekod tidak ditemui.'}</p><button type="button" onClick={() => navigate(`/projek/${projectId}`)} className="mt-4 min-h-11 rounded-xl bg-slate-950 px-4 text-sm font-black text-white">Kembali</button></section>

  const editable = invoice.status === 'draft'
  const canReceivePayment = invoice.status === 'issued' || invoice.status === 'partially_paid'

  return (
    <div className="space-y-5 pb-20 lg:pb-4">
      <header className="rounded-3xl bg-slate-950 p-5 text-white shadow-xl shadow-slate-300 sm:p-7">
        <div className="flex items-start gap-3"><button type="button" onClick={() => navigate(`/projek/${project.id}`)} className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-white/10 hover:bg-white/20" aria-label="Kembali"><ArrowLeft className="h-5 w-5" /></button><div className="min-w-0 flex-1"><span className={`rounded-full px-3 py-1 text-[11px] font-black ${invoiceStatusTone(invoice.status)}`}>{invoiceStatusLabel(invoice.status)}</span><h1 className="mt-3 text-2xl font-black tracking-tight">{invoice.invoice_no}</h1><p className="mt-2 line-clamp-2 text-sm font-semibold text-slate-300">{project.client_name} · {project.project_no}</p></div></div>
        <div className="mt-5 grid grid-cols-2 gap-3"><div className="rounded-2xl bg-white/10 p-3.5"><p className="text-xs font-bold text-slate-400">Jumlah invois</p><p className="mt-1 text-lg font-black text-amber-300">{formatMoney(editable ? currentTotal : Number(invoice.total_amount))}</p></div><div className="rounded-2xl bg-white/10 p-3.5 text-right"><p className="text-xs font-bold text-slate-400">Baki bayaran</p><p className="mt-1 text-lg font-black">{formatMoney(Number(invoice.balance_amount))}</p></div></div>
      </header>

      {error && <p role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">{error}</p>}
      {notice && <p role="status" className="flex items-start gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-800"><CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />{notice}</p>}

      <section className="grid grid-cols-3 gap-3" aria-label="Kedudukan tuntutan projek">
        <FinanceSummary label="Kontrak semasa" value={formatMoney(contractValue)} />
        <FinanceSummary label="Sebelum ini" value={formatMoney(previousBilled)} />
        <FinanceSummary label="Boleh dituntut" value={formatMoney(availableToBill)} tone="text-amber-700" />
      </section>

      <details className="group rounded-3xl border border-slate-200 bg-white shadow-sm">
        <summary className="flex min-h-16 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 sm:px-6"><div><p className="text-sm font-black">Rujukan pelanggan & projek</p><p className="mt-1 text-xs text-slate-500">{project.client_name} · {project.project_no}</p></div><ChevronDown className="h-5 w-5 text-slate-400 transition group-open:rotate-180" /></summary>
        <div className="grid gap-3 border-t border-slate-100 p-4 text-sm sm:grid-cols-2 sm:p-6"><div><p className="text-xs font-bold text-slate-400">Pelanggan</p><p className="mt-1 font-black">{project.client_name}</p><p className="mt-1 text-slate-600">{project.client_phone}</p></div><div><p className="text-xs font-bold text-slate-400">Projek</p><p className="mt-1 font-black">{project.project_name}</p><p className="mt-1 leading-6 text-slate-600">{projectAddress(project)}</p></div></div>
      </details>

      {editable && <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
        <div className="flex items-start justify-between gap-3"><div><p className="text-sm font-bold text-amber-700">Maklumat invois</p><h2 className="mt-1 text-xl font-black">Draf tuntutan</h2></div><p className="text-right text-[11px] font-bold text-emerald-700">{autosaveLabel}</p></div>
        <div className="mt-5 grid gap-4 sm:grid-cols-2"><label className="block"><span className="field-label">Tarikh invois *</span><input type="date" value={draft.invoice_date} onChange={(event) => patchDraft({ invoice_date: event.target.value })} className="field-control" /></label><label className="block"><span className="field-label">Tarikh akhir bayaran</span><input type="date" value={draft.due_date} min={draft.invoice_date} onChange={(event) => patchDraft({ due_date: event.target.value })} className="field-control" /></label><label className="block sm:col-span-2"><span className="field-label">Tajuk *</span><input value={draft.title} onChange={(event) => patchDraft({ title: event.target.value })} className="field-control" /></label><label className="block sm:col-span-2"><span className="field-label">Nota</span><textarea value={draft.notes} onChange={(event) => patchDraft({ notes: event.target.value })} className="field-control" placeholder="Pilihan: penerangan peringkat atau maklumat tambahan." /></label></div>
      </section>}

      {editable && <section className="rounded-3xl border border-amber-200 bg-amber-50 p-4 sm:p-6">
        <div><p className="text-sm font-bold text-amber-800">Tambah tuntutan</p><h2 className="mt-1 text-xl font-black">Progress, VO atau jumlah manual</h2><p className="mt-1 text-sm leading-6 text-slate-600">Ini menyokong jadual 4, 5 atau 8 peringkat tanpa memaksa satu template. Setiap peringkat boleh guna peratus atau jumlah sebenar.</p></div>
        <div className="mt-4 grid grid-cols-3 gap-2">{([['progress', 'Progress'], ['approved_variation', 'VO'], ['manual', 'Manual']] as const).map(([value, label]) => <button key={value} type="button" onClick={() => { setComposerMode(value); setComposerDescription(''); setComposerAmount(''); setComposerVariationId('') }} className={`min-h-11 rounded-xl px-2 text-xs font-black ${composerMode === value ? 'bg-slate-950 text-white' : 'border border-amber-200 bg-white text-slate-700'}`}>{label}</button>)}</div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {composerMode === 'approved_variation' && <label className="block sm:col-span-2"><span className="field-label">Variation Order diluluskan *</span><select value={composerVariationId} onChange={(event) => { const id = Number(event.target.value); setComposerVariationId(event.target.value); const order = variationOrders.find((row) => row.id === id); if (order) { setComposerDescription(`${order.vo_no} — ${order.title}`); setComposerAmount((approvedVoRemaining.get(id) ?? 0).toFixed(2)) } }} className="field-control"><option value="">Pilih VO</option>{variationOrders.filter((order) => (approvedVoRemaining.get(order.id) ?? 0) > 0).map((order) => <option key={order.id} value={order.id}>{order.vo_no} · Baki {formatMoney(approvedVoRemaining.get(order.id) ?? 0)}</option>)}</select>{!variationOrders.length && <p className="mt-2 text-xs font-semibold text-amber-800">Belum ada VO tambahan yang diluluskan.</p>}</label>}
          {composerMode === 'progress' && <label className="block"><span className="field-label">Peratus peringkat *</span><input inputMode="decimal" value={composerPercentage} onChange={(event) => { setComposerPercentage(event.target.value); setComposerAmount(progressAmount(contractValue, event.target.value).toFixed(2)) }} className="field-control" placeholder="Contoh: 20" /></label>}
          <label className={`block ${composerMode !== 'progress' ? 'sm:col-span-2' : ''}`}><span className="field-label">Jumlah tuntutan (RM) *</span><input inputMode="decimal" value={composerAmount || (composerMode === 'progress' ? progressAmount(contractValue, composerPercentage).toFixed(2) : '')} onChange={(event) => setComposerAmount(event.target.value)} className="field-control" placeholder="0.00" /></label>
          <label className="block sm:col-span-2"><span className="field-label">Keterangan {composerMode === 'manual' ? '*' : ''}</span><textarea value={composerDescription} onChange={(event) => setComposerDescription(event.target.value)} className="field-control" placeholder={composerMode === 'progress' ? 'Contoh: Peringkat 2 — kerja bata dan bumbung' : 'Keterangan tuntutan'} /></label>
        </div>
        <button type="button" onClick={addClaim} className="mt-4 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 text-sm font-black text-white sm:w-auto"><Plus className="h-5 w-5" />Tambah ke Invois</button>
      </section>}

      <section className="space-y-3">
        <div className="flex items-end justify-between gap-3"><div><p className="text-sm font-bold text-amber-700">Butiran tuntutan</p><h2 className="mt-1 text-xl font-black">Item invois</h2></div><p className="text-lg font-black">{formatMoney(editable ? currentTotal : Number(invoice.total_amount))}</p></div>
        {draft.items.map((item, index) => <article key={item.local_id} className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5"><div className="flex items-start justify-between gap-3"><span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-black text-slate-700">{index + 1}. {invoiceSourceLabel(item.source_type)}</span>{editable && <button type="button" onClick={() => patchDraft({ items: draft.items.filter((row) => row.local_id !== item.local_id) })} className="grid h-10 w-10 place-items-center rounded-xl border border-red-200 text-red-700" aria-label="Padam tuntutan"><Trash2 className="h-4.5 w-4.5" /></button>}</div>{editable ? <div className="mt-4 grid gap-4 sm:grid-cols-3"><label className="block sm:col-span-2"><span className="field-label">Keterangan *</span><textarea value={item.description} onChange={(event) => patchItem(item.local_id, { description: event.target.value })} className="field-control" /></label>{item.source_type === 'progress' && <label className="block"><span className="field-label">Progress (%)</span><input inputMode="decimal" value={item.percentage} onChange={(event) => patchItem(item.local_id, { percentage: event.target.value, amount: progressAmount(contractValue, event.target.value).toFixed(2) })} className="field-control" /></label>}<label className="block"><span className="field-label">Jumlah (RM) *</span><input inputMode="decimal" value={item.amount} onChange={(event) => patchItem(item.local_id, { amount: event.target.value })} className="field-control" /></label></div> : <div className="mt-4 flex items-start justify-between gap-4"><div><p className="font-black leading-6">{item.description}</p>{item.percentage && <p className="mt-1 text-xs font-semibold text-blue-700">{item.percentage}% daripada kontrak semasa ketika invois dikeluarkan</p>}</div><p className="shrink-0 font-black">{formatMoney(Number(item.amount))}</p></div>}</article>)}
        {!draft.items.length && <p className="rounded-3xl border-2 border-dashed border-slate-200 bg-white p-7 text-center text-sm text-slate-500">Belum ada tuntutan. Pilih Progress, VO atau Manual di atas.</p>}
      </section>

      {!editable && <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6"><div className="flex items-start gap-3"><CircleDollarSign className="mt-0.5 h-6 w-6 shrink-0 text-emerald-700" /><div><p className="text-sm font-bold text-emerald-700">Kedudukan bayaran</p><h2 className="mt-1 text-xl font-black">{formatMoney(Number(invoice.paid_amount))} diterima</h2><p className="mt-1 text-sm text-slate-500">Baki semasa: <strong className="text-slate-800">{formatMoney(Number(invoice.balance_amount))}</strong></p></div></div></section>}

      {canReceivePayment && <section className="rounded-3xl border border-emerald-200 bg-emerald-50 p-4 sm:p-6"><div className="flex items-start gap-3"><Banknote className="mt-0.5 h-6 w-6 shrink-0 text-emerald-700" /><div><p className="text-sm font-bold text-emerald-700">Bayaran sebenar</p><h2 className="mt-1 text-xl font-black">Rekod bayaran separa atau penuh</h2><p className="mt-1 text-sm leading-6 text-slate-600">Setiap rekod menjana satu resit tersendiri dan tidak boleh diedit selepas disimpan.</p></div></div><div className="mt-5 grid gap-4 sm:grid-cols-2"><label className="block"><span className="field-label">Tarikh bayaran *</span><input type="date" value={paymentDate} onChange={(event) => setPaymentDate(event.target.value)} className="field-control" /></label><label className="block"><span className="field-label">Jumlah diterima (RM) *</span><input inputMode="decimal" value={paymentAmount} onChange={(event) => setPaymentAmount(event.target.value)} className="field-control" /></label><label className="block"><span className="field-label">Kaedah *</span><select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value as PaymentMethod)} className="field-control"><option value="bank_transfer">Pindahan bank</option><option value="cash">Tunai</option><option value="cheque">Cek</option><option value="card">Kad</option><option value="other">Lain-lain</option></select></label><label className="block"><span className="field-label">No. rujukan</span><input value={paymentReference} onChange={(event) => setPaymentReference(event.target.value)} className="field-control" placeholder="Pilihan" /></label><label className="block sm:col-span-2"><span className="field-label">Nota</span><textarea value={paymentNotes} onChange={(event) => setPaymentNotes(event.target.value)} className="field-control" placeholder="Pilihan" /></label></div><button type="button" disabled={busy} onClick={() => void recordPayment()} className="mt-4 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 text-sm font-black text-white disabled:opacity-60 sm:w-auto"><ReceiptText className="h-5 w-5" />Rekod & Jana Resit</button></section>}

      {payments.length > 0 && <section className="space-y-3"><div><p className="text-sm font-bold text-amber-700">Sejarah tidak boleh diubah</p><h2 className="mt-1 text-xl font-black">Bayaran & resit</h2></div>{payments.map((payment) => <Link key={payment.id} href={`/projek/${project.id}/invois/${invoice.id}/bayaran/${payment.id}/cetak`} className="flex items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex min-w-0 items-center gap-3"><div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-emerald-100 text-emerald-800"><ReceiptText className="h-5 w-5" /></div><div className="min-w-0"><p className="font-black">{payment.receipt_no}</p><p className="mt-1 truncate text-xs text-slate-500">{formatInvoiceDate(payment.payment_date)} · {paymentMethodLabel(payment.payment_method)}</p></div></div><div className="text-right"><p className="font-black text-emerald-700">{formatMoney(Number(payment.amount))}</p><p className="mt-1 text-[10px] font-bold text-slate-400">Baki {formatMoney(Number(payment.balance_after_snapshot))}</p></div></Link>)}</section>}

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {editable && <button type="button" disabled={busy} onClick={() => void saveManually()} className="flex min-h-12 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 text-sm font-black text-slate-800 disabled:opacity-60"><Save className="h-5 w-5" />Simpan Draf</button>}
        <button type="button" disabled={busy || invoice.status === 'void'} onClick={() => void openPrint()} className="flex min-h-12 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 text-sm font-black text-slate-800 disabled:opacity-60"><FileDown className="h-5 w-5" />Cetak / PDF</button>
        {!editable && invoice.status !== 'void' && <button type="button" onClick={openWhatsApp} className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 text-sm font-black text-white"><MessageCircle className="h-5 w-5" />WhatsApp</button>}
        {editable && <button type="button" disabled={busy} onClick={() => void issueInvoice()} className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-amber-400 px-4 text-sm font-black text-slate-950 disabled:opacity-60"><Send className="h-5 w-5" />Keluarkan Invois</button>}
        {(invoice.status === 'draft' || (invoice.status === 'issued' && !payments.length)) && <button type="button" disabled={busy} onClick={() => void voidInvoice()} className="min-h-12 rounded-xl border border-red-200 bg-white px-4 text-sm font-black text-red-700 disabled:opacity-60">Batalkan Invois</button>}
      </section>

      {!editable && invoice.issued_at && <p className="flex items-center gap-2 text-xs font-semibold text-slate-400"><CalendarClock className="h-4 w-4" />Dikeluarkan {formatInvoiceDate(invoice.issued_at)}</p>}
    </div>
  )
}

function FinanceSummary({ label, value, tone = '' }: { label: string; value: string; tone?: string }) {
  return <article className="min-w-0 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4"><p className="text-[10px] font-black uppercase tracking-wide text-slate-400">{label}</p><p className={`mt-2 truncate text-sm font-black sm:text-lg ${tone}`}>{value}</p></article>
}

function isServerPersistable(draft: InvoiceDraft) {
  return validateInvoiceDraft(draft) === null
}
