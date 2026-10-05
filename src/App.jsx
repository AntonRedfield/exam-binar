import { useState, useEffect, createContext, useContext } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { getSession, getUserRole, getUserLevel, onAuthStateChange, _syncCurrentUser, getCurrentUser, logout } from './lib/auth'
import { startSessionGuard } from './lib/sessionGuard'

// ─── Page Imports ───────────────────────────────────────────────────────────
import Login from './pages/Login'
import StudentHome from './pages/StudentHome'
import ExamLobby from './pages/ExamLobby'
import ExamRoom from './pages/ExamRoom'
import Results from './pages/Results'
import SurveyRoom from './pages/SurveyRoom'

import TeacherLayout from './pages/teacher/TeacherLayout'
import TeacherDashboard from './pages/teacher/TeacherDashboard'
import ExamList from './pages/teacher/ExamList'
import CreateExam from './pages/teacher/CreateExam'
import Monitor from './pages/teacher/Monitor'
import ResultsView from './pages/teacher/ResultsView'
import QuestionAnalytics from './pages/teacher/QuestionAnalytics'
import SurveyResponses from './pages/teacher/SurveyResponses'

import AdminLayout from './pages/admin/AdminLayout'
import AdminDashboard from './pages/admin/AdminDashboard'
import UserManagement from './pages/admin/UserManagement'
import ExamOversight from './pages/admin/ExamOversight'
import Analytics from './pages/admin/Analytics'

import './index.css'

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
            <ProtectedRoute roles={['USER']}>
              <ExamLobby />
            </ProtectedRoute>
          } />
          <Route path="/exam/:examId/room" element={
            <ProtectedRoute roles={['USER']}>
              <ExamRoom />
            </ProtectedRoute>
          } />
          <Route path="/results/:resultId" element={
            <ProtectedRoute roles={['USER', 'MODERATOR', 'SUPERADMIN']}>
              <Results />
            </ProtectedRoute>
          } />
          <Route path="/survey/:examId" element={
            <ProtectedRoute roles={['USER']}>
              <SurveyRoom />
            </ProtectedRoute>
          } />

          {/* Teacher Routes */}
          <Route path="/teacher" element={
            <ProtectedRoute roles={['MODERATOR', 'SUPERADMIN']}>
              <TeacherLayout />
            </ProtectedRoute>
          }>
            <Route path="dashboard" element={<TeacherDashboard />} />
            <Route path="exams" element={<ExamList />} />
            <Route path="create" element={<CreateExam />} />
            <Route path="edit/:examId" element={<CreateExam />} />
            <Route path="monitor/:examId" element={<Monitor />} />
            <Route path="results/:examId" element={<ResultsView />} />
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
            <Route path="dashboard" element={<AdminDashboard />} />
            <Route path="users" element={<UserManagement />} />
            <Route path="exams" element={<ExamOversight />} />
            <Route path="create" element={<CreateExam />} />
            <Route path="edit/:examId" element={<CreateExam />} />
            <Route path="analytics" element={<Analytics />} />
            <Route path="results/:examId" element={<ResultsView />} />
            <Route path="analytics/:examId" element={<QuestionAnalytics />} />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}
