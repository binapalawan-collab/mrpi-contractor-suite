import { Bell } from 'lucide-react'
import { useEffect } from 'react'
import { Route, Switch, useLocation } from 'wouter'
import { AuthProvider } from './auth/AuthProvider'
import { RequireAuth } from './auth/RequireAuth'
import { AppShell } from './components/AppShell'
import { isSupabaseConfigured } from './lib/supabase'
import { AuthPage } from './pages/AuthPage'
import { AgreementPage } from './pages/AgreementPage'
import { AgreementPrintPage } from './pages/AgreementPrintPage'
import { CatalogPage } from './pages/CatalogPage'
import { CompanyProfilePage } from './pages/CompanyProfilePage'
import { DashboardPage } from './pages/DashboardPage'
import { FinancePage } from './pages/FinancePage'
import { InvoiceEditorPage } from './pages/InvoiceEditorPage'
import { InvoicePrintPage } from './pages/InvoicePrintPage'
import { MoreMenuPage } from './pages/MoreMenuPage'
import { PaymentSchedulePage } from './pages/PaymentSchedulePage'
import { PlaceholderPage } from './pages/PlaceholderPage'
import { ProjectAliasPage } from './pages/ProjectAliasPage'
import { ProjectDetailPage } from './pages/ProjectDetailPage'
import { ProjectListPage } from './pages/ProjectListPage'
import { ProjectStatementPage } from './pages/ProjectStatementPage'
import { QuotationEditorPage } from './pages/QuotationEditorPage'
import { QuotationListPage } from './pages/QuotationListPage'
import { QuotationPrintPage } from './pages/QuotationPrintPage'
import { ReceiptPrintPage } from './pages/ReceiptPrintPage'
import { SiteVisitPage } from './pages/SiteVisitPage'
import { SetupRequiredPage } from './pages/SetupRequiredPage'
import { UpdatePasswordPage } from './pages/UpdatePasswordPage'
import { VariationOrderEditorPage } from './pages/VariationOrderEditorPage'
import { VariationOrderPrintPage } from './pages/VariationOrderPrintPage'

export default function App() {
  if (!isSupabaseConfigured) return <SetupRequiredPage />

  return (
    <AuthProvider>
      <Switch>
        <Route path="/login"><AuthPage /></Route>
        <Route path="/tetapan-kata-laluan"><UpdatePasswordPage /></Route>
        <Route>
          <RequireAuth>
            <AppShell>
              <ProtectedRoutes />
            </AppShell>
          </RequireAuth>
        </Route>
      </Switch>
    </AuthProvider>
  )
}

function ProtectedRoutes() {
  return (
    <Switch>
      <Route path="/"><DashboardPage /></Route>
      <Route path="/profil"><CompanyProfilePage /></Route>
      <Route path="/lawatan-tapak"><SiteVisitPage /></Route>
      <Route path="/sebutharga/baru"><QuotationEditorPage /></Route>
      <Route path="/sebutharga/:id/revision/:revisionNo/cetak">{({ id, revisionNo }) => <QuotationPrintPage quotationId={id} revisionNo={revisionNo} />}</Route>
      <Route path="/sebutharga/:id/cetak">{({ id }) => <QuotationPrintPage quotationId={id} />}</Route>
      <Route path="/sebutharga/:id">{({ id }) => <QuotationEditorPage quotationId={id} />}</Route>
      <Route path="/sebutharga"><QuotationListPage /></Route>
      <Route path="/projek-alias"><ProjectAliasPage /></Route>
      <Route path="/projek/:projectId/vo/:voId/cetak">{({ projectId, voId }) => <VariationOrderPrintPage projectId={projectId} variationOrderId={voId} />}</Route>
      <Route path="/projek/:projectId/vo/:voId">{({ projectId, voId }) => <VariationOrderEditorPage projectId={projectId} variationOrderId={voId} />}</Route>
      <Route path="/projek/:projectId/perjanjian/cetak">{({ projectId }) => <AgreementPrintPage projectId={projectId} />}</Route>
      <Route path="/projek/:projectId/perjanjian">{({ projectId }) => <AgreementPage projectId={projectId} />}</Route>
      <Route path="/projek/:projectId/invois/:invoiceId/bayaran/:paymentId/cetak">{({ projectId, invoiceId, paymentId }) => <ReceiptPrintPage projectId={projectId} invoiceId={invoiceId} paymentId={paymentId} />}</Route>
      <Route path="/projek/:projectId/invois/:invoiceId/cetak">{({ projectId, invoiceId }) => <InvoicePrintPage projectId={projectId} invoiceId={invoiceId} />}</Route>
      <Route path="/projek/:projectId/invois/:invoiceId">{({ projectId, invoiceId }) => <InvoiceEditorPage projectId={projectId} invoiceId={invoiceId} />}</Route>
      <Route path="/projek/:projectId/jadual-bayaran">{({ projectId }) => <PaymentSchedulePage projectId={projectId} />}</Route>
      <Route path="/projek/:projectId/penyata">{({ projectId }) => <ProjectStatementPage projectId={projectId} />}</Route>
      <Route path="/projek/:id">{({ id }) => <ProjectDetailPage projectId={id} />}</Route>
      <Route path="/projek"><ProjectListPage /></Route>
      <Route path="/kewangan"><FinancePage /></Route>
      <Route path="/katalog"><CatalogPage /></Route>
      <Route path="/notifikasi"><PlaceholderPage title="Notifikasi" description="Peringatan bayaran, dokumen belum lengkap dan tindakan projek akan dipaparkan di sini." milestone="Milestone 3" icon={Bell} /></Route>
      <Route path="/menu"><MoreMenuPage /></Route>
      <Route><NotFoundRedirect /></Route>
    </Switch>
  )
}

function NotFoundRedirect() {
  const [, navigate] = useLocation()
  useEffect(() => navigate('/', { replace: true }), [navigate])
  return null
}
