import { useEffect } from 'react'
import { Route, Switch, useLocation } from 'wouter'
import { AuthProvider } from './auth/AuthProvider'
import { RequireAuth } from './auth/RequireAuth'
import { AppShell } from './components/AppShell'
import { isSupabaseConfigured } from './lib/supabase'
import { AuthPage } from './pages/AuthPage'
import { DashboardPage } from './pages/DashboardPage'
import { ExpenseDetailPage } from './pages/ExpenseDetailPage'
import { ExpenseFormPage } from './pages/ExpenseFormPage'
import { ExpenseListPage } from './pages/ExpenseListPage'
import { ProjectListPage } from './pages/ProjectListPage'
import { SetupRequiredPage } from './pages/SetupRequiredPage'
import { SupplierPage } from './pages/SupplierPage'
import { UpdatePasswordPage } from './pages/UpdatePasswordPage'

export default function App(){if(!isSupabaseConfigured)return <SetupRequiredPage/>;return <AuthProvider><Switch><Route path="/login"><AuthPage/></Route><Route path="/tetapan-kata-laluan"><UpdatePasswordPage/></Route><Route><RequireAuth><AppShell><Protected/></AppShell></RequireAuth></Route></Switch></AuthProvider>}
function Protected(){return <Switch><Route path="/"><DashboardPage/></Route><Route path="/expenses/baru"><ExpenseFormPage/></Route><Route path="/expenses/:id">{({id})=><ExpenseDetailPage expenseId={id}/>}</Route><Route path="/expenses"><ExpenseListPage/></Route><Route path="/projek"><ProjectListPage/></Route><Route path="/pembekal"><SupplierPage/></Route><Route><Redirect/></Route></Switch>}
function Redirect(){const [,navigate]=useLocation();useEffect(()=>navigate('/',{replace:true}),[navigate]);return null}
