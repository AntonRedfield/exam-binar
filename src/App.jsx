import { useState, useEffect, createContext, useContext, lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { getSession, getUserRole, getUserLevel, onAuthStateChange, _syncCurrentUser, getCurrentUser, logout } from './lib/auth'
import { startSessionGuard } from './lib/sessionGuard'

// ─── Lazy Page Imports (code-split per route) ───────────────────────────────
const Login = lazy(() => import('./pages/Login'))
const StudentHome = lazy(() => import('./pages/StudentHome'))
const ExamLobby = lazy(() => import('./pages/ExamLobby'))
const ExamRoom = lazy(() => import('./pages/ExamRoom'))
const Results = lazy(() => import('./pages/Results'))
const SurveyRoom = lazy(() => import('./pages/SurveyRoom'))

const TeacherLayout = lazy(() => import('./pages/teacher/TeacherLayout'))
const TeacherDashboard = lazy(() => import('./pages/teacher/TeacherDashboard'))
const ExamList = lazy(() => import('./pages/teacher/ExamList'))
const CreateExam = lazy(() => import('./pages/teacher/CreateExam'))
const Monitor = lazy(() => import('./pages/teacher/Monitor'))
const ActiveMonitorHub = lazy(() => import('./pages/teacher/ActiveMonitorHub'))
const ResultsView = lazy(() => import('./pages/teacher/ResultsView'))
const QuestionAnalytics = lazy(() => import('./pages/teacher/QuestionAnalytics'))
const SurveyResponses = lazy(() => import('./pages/teacher/SurveyResponses'))

const AdminLayout = lazy(() => import('./pages/admin/AdminLayout'))
const AdminDashboard = lazy(() => import('./pages/admin/AdminDashboard'))
const UserManagement = lazy(() => import('./pages/admin/UserManagement'))
const ExamOversight = lazy(() => import('./pages/admin/ExamOversight'))
const Analytics = lazy(() => import('./pages/admin/Analytics'))
const ClassManagement = lazy(() => import('./pages/admin/ClassManagement'))
const LoginLogs = lazy(() => import('./pages/admin/LoginLogs'))

import ErrorBoundary from './components/ErrorBoundary'
import './index.css'

// ─── Route Loading Fallback ─────────────────────────────────────────────────
function PageLoader() {
  return (
    <div className="loading-screen" style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: '#ffffff',
    }}>
      <div className="spinner" style={{ width: 40, height: 40, borderColor: '#e2e8f0', borderTopColor: '#1b3361' }} />
    </div>
  )
}

// ─── Auth Context ───────────────────────────────────────────────────────────

const AuthContext = createContext(null)

export function useAuth() {
  return useContext(AuthContext)
}

function AuthProvider({ children }) {
  const [session, setSession] = useState(undefined) // undefined = loading
  
  useEffect(() => {
    // 1. Restore existing session on mount
    getSession().then((result) => {
      _syncCurrentUser(result) // sync backward-compat cache
      setSession(result)
    })

    // 2. Listen for auth state changes (login, logout, token refresh)
    const { data: { subscription } } = onAuthStateChange((_event, supaSession) => {
      if (supaSession?.user) {
        const sessionData = {
          user: supaSession.user,
          session: supaSession,
          level: getUserLevel(supaSession.user),
          role: getUserRole(supaSession.user),
        }
        _syncCurrentUser(sessionData)
        setSession(sessionData)
      } else {
        _syncCurrentUser(null)
        setSession(null)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  // 3. Strict single active session watcher for Level 1 & Level 2 users
  useEffect(() => {
    if (!session?.user) return
    const stopGuard = startSessionGuard(
      {
        id: session.user.id,
        level: session.level,
        session: session.session,
      },
      (reason) => {
        logout(reason)
      }
    )
    return () => stopGuard()
  }, [session?.user?.id, session?.level])

  // Show loading spinner while session is being determined
  if (session === undefined) {
    return (
      <div className="loading-screen" style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#ffffff',
      }}>
        <div className="spinner" style={{ width: 40, height: 40, borderColor: '#e2e8f0', borderTopColor: '#1b3361' }} />
      </div>
    )
  }

  return (
    <AuthContext.Provider value={session}>
      {children}
    </AuthContext.Provider>
  )
}

// ─── Route Guards ───────────────────────────────────────────────────────────

/**
 * ProtectedRoute — guards routes by app role names.
 * Accepts `roles` array for backward compat with existing route definitions.
 */
function ProtectedRoute({ children, roles }) {
  const auth = useAuth()
  if (!auth) return <Navigate to="/login" replace />
  if (roles && !roles.includes(auth.role)) return <Navigate to="/login" replace />
  return children
}

/**
 * RoleRedirect — redirects authenticated users to their role-appropriate dashboard.
 */
function RoleRedirect() {
  const auth = useAuth()
  if (!auth) return <Navigate to="/login" replace />

  switch (auth.role) {
    case 'SUPERADMIN': return <Navigate to="/admin/dashboard" replace />
    case 'MODERATOR':  return <Navigate to="/teacher/dashboard" replace />
    default:           return <Navigate to="/home" replace />
  }
}

// ─── App ────────────────────────────────────────────────────────────────────

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ErrorBoundary>
          <Suspense fallback={<PageLoader />}>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/" element={<RoleRedirect />} />

            {/* Student Routes */}
            <Route path="/home" element={
              <ProtectedRoute roles={['USER']}>
                <StudentHome />
              </ProtectedRoute>
            } />
            <Route path="/exam/:examId/lobby" element={
              <ProtectedRoute roles={['USER', 'MODERATOR', 'SUPERADMIN']}>
                <ExamLobby />
              </ProtectedRoute>
            } />
            <Route path="/exam/:examId/room" element={
              <ProtectedRoute roles={['USER', 'MODERATOR', 'SUPERADMIN']}>
                <ExamRoom />
              </ProtectedRoute>
            } />
            <Route path="/results/:resultId" element={
              <ProtectedRoute roles={['USER', 'MODERATOR', 'SUPERADMIN']}>
                <Results />
              </ProtectedRoute>
            } />
            <Route path="/survey/:examId" element={
              <ProtectedRoute roles={['USER', 'MODERATOR', 'SUPERADMIN']}>
                <SurveyRoom />
              </ProtectedRoute>
            } />

            {/* Teacher Routes */}
            <Route path="/teacher" element={
              <ProtectedRoute roles={['MODERATOR', 'SUPERADMIN']}>
                <TeacherLayout />
              </ProtectedRoute>
            }>
              <Route index element={<Navigate to="dashboard" replace />} />
              <Route path="dashboard" element={<TeacherDashboard />} />
              <Route path="exams" element={<ExamList />} />
              <Route path="create" element={<CreateExam />} />
              <Route path="edit/:examId" element={<CreateExam />} />
              <Route path="monitor" element={<ActiveMonitorHub />} />
              <Route path="monitor/:examId" element={<Monitor />} />
              <Route path="results" element={<Navigate to="/teacher/exams" replace />} />
              <Route path="results/:examId" element={<ResultsView />} />
              <Route path="analytics" element={<Navigate to="/teacher/exams" replace />} />
              <Route path="analytics/:examId" element={<QuestionAnalytics />} />
              <Route path="students" element={<UserManagement />} />
              <Route path="survey-responses/:examId" element={<SurveyResponses />} />
            </Route>

            {/* Admin Routes */}
            <Route path="/admin" element={
              <ProtectedRoute roles={['SUPERADMIN']}>
                <AdminLayout />
              </ProtectedRoute>
            }>
              <Route index element={<Navigate to="dashboard" replace />} />
              <Route path="dashboard" element={<AdminDashboard />} />
              <Route path="users" element={<UserManagement />} />
              <Route path="logs" element={<LoginLogs />} />
              <Route path="classes" element={<ClassManagement />} />
              <Route path="exams" element={<ExamOversight />} />
              <Route path="create" element={<CreateExam />} />
              <Route path="edit/:examId" element={<CreateExam />} />
              <Route path="analytics" element={<Analytics />} />
              <Route path="monitor" element={<ActiveMonitorHub />} />
              <Route path="monitor/:examId" element={<Monitor />} />
              <Route path="results" element={<Navigate to="/admin/exams" replace />} />
              <Route path="results/:examId" element={<ResultsView />} />
              <Route path="analytics/:examId" element={<QuestionAnalytics />} />
            </Route>

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          </Suspense>
        </ErrorBoundary>
      </AuthProvider>
    </BrowserRouter>
  )
}
