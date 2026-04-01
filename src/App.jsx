import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { getCurrentUser } from './lib/auth'
import Login from './pages/Login'
import StudentHome from './pages/StudentHome'
import ExamLobby from './pages/ExamLobby'
import ExamRoom from './pages/ExamRoom'
import Results from './pages/Results'
import TeacherLayout from './pages/teacher/TeacherLayout'
import ExamList from './pages/teacher/ExamList'
import CreateExam from './pages/teacher/CreateExam'
import Monitor from './pages/teacher/Monitor'
import ResultsView from './pages/teacher/ResultsView'
import AdminLayout from './pages/admin/AdminLayout'
import UserManagement from './pages/admin/UserManagement'
import ExamOversight from './pages/admin/ExamOversight'
import Analytics from './pages/admin/Analytics'
import './index.css'

function ProtectedRoute({ children, roles }) {
  const user = getCurrentUser()
  if (!user) return <Navigate to="/login" replace />
  if (roles && !roles.includes(user.role)) return <Navigate to="/login" replace />
  return children
}

function RoleRedirect() {
  const user = getCurrentUser()
  if (!user) return <Navigate to="/login" replace />
  if (user.role === 'SUPERADMIN') return <Navigate to="/admin/users" replace />
  if (user.role === 'TEACHER') return <Navigate to="/teacher/exams" replace />
  return <Navigate to="/home" replace />
}

export default function App() {
  return (
    <BrowserRouter>
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
          <ProtectedRoute roles={['USER', 'TEACHER', 'SUPERADMIN']}>
            <Results />
          </ProtectedRoute>
        } />

        {/* Teacher Routes */}
        <Route path="/teacher" element={
          <ProtectedRoute roles={['TEACHER', 'SUPERADMIN']}>
            <TeacherLayout />
          </ProtectedRoute>
        }>
          <Route path="exams" element={<ExamList />} />
          <Route path="create" element={<CreateExam />} />
          <Route path="edit/:examId" element={<CreateExam />} />
          <Route path="monitor/:examId" element={<Monitor />} />
          <Route path="results/:examId" element={<ResultsView />} />
          <Route path="students" element={<UserManagement />} />
        </Route>

        {/* Admin Routes */}
        <Route path="/admin" element={
          <ProtectedRoute roles={['SUPERADMIN']}>
            <AdminLayout />
          </ProtectedRoute>
        }>
          <Route path="users" element={<UserManagement />} />
          <Route path="exams" element={<ExamOversight />} />
          <Route path="analytics" element={<Analytics />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
