import { BrowserRouter, HashRouter, MemoryRouter, Navigate, Route, Routes } from 'react-router-dom'

// Nella versione pubblicata come pagina statica incorporata si usa un router in memoria
const Router = import.meta.env.VITE_ROUTER === 'memory' ? MemoryRouter : import.meta.env.VITE_ROUTER === 'hash' ? HashRouter : BrowserRouter
import { DemoProvider } from '@/context/DemoProvider'
import { ToastProvider } from '@/context/ToastProvider'
import { TenantProvider } from '@/tenant/TenantProvider'
import { AppShell } from '@/components/layout/AppShell'
import { RequireRole } from '@/components/layout/RequireRole'
import { UpdatePrompt } from '@/components/layout/UpdatePrompt'
import { NavigationTracker } from '@/components/common/NavigationTracker'
import { WelcomePage } from '@/pages/auth/WelcomePage'
import { StudentHome } from '@/pages/student/StudentHome'
import { StudentCalendar } from '@/pages/student/StudentCalendar'
import { StudentFigures } from '@/pages/student/StudentFigures'
import { StudentFigureDetail } from '@/pages/student/StudentFigureDetail'
import { StudentProgress } from '@/pages/student/StudentProgress'
import { StudentProfile } from '@/pages/student/StudentProfile'
import { StudentClasses } from '@/pages/student/StudentClasses'
import { StudentEvents } from '@/pages/student/StudentEvents'
import { TeacherDashboard } from '@/pages/teacher/TeacherDashboard'
import { TeacherLessons } from '@/pages/teacher/TeacherLessons'
import { TeacherLessonDetail } from '@/pages/teacher/TeacherLessonDetail'
import { TeacherStudents } from '@/pages/teacher/TeacherStudents'
import { TeacherProfile } from '@/pages/teacher/TeacherProfile'
import { AdminDashboard } from '@/pages/admin/AdminDashboard'
import { AdminUsers } from '@/pages/admin/AdminUsers'
import { AdminClasses } from '@/pages/admin/AdminClasses'
import { AdminEvents } from '@/pages/admin/AdminEvents'
import { AdminSettings } from '@/pages/admin/AdminSettings'
import { FigureEditorPage } from '@/pages/shared/FigureEditorPage'
import { ManageFiguresPage } from '@/pages/shared/ManageFiguresPage'
import { ManageFigureDetailPage } from '@/pages/shared/ManageFigureDetailPage'
import { StudentJourneyPage } from '@/pages/shared/StudentJourneyPage'

export default function App() {
  return (
    <Router>
      <TenantProvider>
      <DemoProvider>
        <ToastProvider>
          <UpdatePrompt />
          <NavigationTracker />
          <Routes>
            <Route path="/" element={<WelcomePage />} />

            <Route
              path="/allieva"
              element={
                <RequireRole role="allieva">
                  <AppShell role="allieva" />
                </RequireRole>
              }
            >
              <Route index element={<StudentHome />} />
              <Route path="calendario" element={<StudentCalendar />} />
              <Route path="figure" element={<StudentFigures />} />
              <Route path="figure/:id" element={<StudentFigureDetail />} />
              <Route path="progressi" element={<StudentProgress />} />
              <Route path="profilo" element={<StudentProfile />} />
              <Route path="classi" element={<StudentClasses />} />
              <Route path="eventi" element={<StudentEvents />} />
            </Route>

            <Route
              path="/insegnante"
              element={
                <RequireRole role="insegnante">
                  <AppShell role="insegnante" />
                </RequireRole>
              }
            >
              <Route index element={<TeacherDashboard />} />
              <Route path="lezioni" element={<TeacherLessons />} />
              <Route path="lezioni/:id" element={<TeacherLessonDetail />} />
              <Route path="allieve" element={<TeacherStudents />} />
              <Route path="allieve/:id" element={<StudentJourneyPage backTo="/insegnante/allieve" backLabel="Allieve" figureBase="/insegnante/figure" />} />
              <Route path="figure" element={<ManageFiguresPage basePath="/insegnante/figure" />} />
              <Route path="figure/nuova" element={<FigureEditorPage basePath="/insegnante/figure" />} />
              <Route path="figure/:id" element={<ManageFigureDetailPage basePath="/insegnante/figure" studentBase="/insegnante/allieve" />} />
              <Route path="figure/:id/modifica" element={<FigureEditorPage basePath="/insegnante/figure" />} />
              <Route path="profilo" element={<TeacherProfile />} />
              <Route path="eventi" element={<AdminEvents />} />
            </Route>

            <Route
              path="/admin"
              element={
                <RequireRole role="admin">
                  <AppShell role="admin" />
                </RequireRole>
              }
            >
              <Route index element={<AdminDashboard />} />
              <Route path="utenti" element={<AdminUsers />} />
              <Route path="utenti/:id" element={<StudentJourneyPage backTo="/admin/utenti" backLabel="Utenti" figureBase="/admin/figure" showAdmin />} />
              <Route path="classi" element={<AdminClasses />} />
              <Route path="figure" element={<ManageFiguresPage basePath="/admin/figure" />} />
              <Route path="figure/nuova" element={<FigureEditorPage basePath="/admin/figure" />} />
              <Route path="figure/:id" element={<ManageFigureDetailPage basePath="/admin/figure" studentBase="/admin/utenti" />} />
              <Route path="figure/:id/modifica" element={<FigureEditorPage basePath="/admin/figure" />} />
              <Route path="eventi" element={<AdminEvents />} />
              <Route path="gestione" element={<AdminSettings />} />
            </Route>

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </ToastProvider>
      </DemoProvider>
      </TenantProvider>
    </Router>
  )
}
