import { lazy, Suspense } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import GlobalError from '@/pages/system/GlobalError';
import NotFound from '@/pages/system/NotFound';
import AppLayout from '@/layouts/AppLayout';
import AssessmentListPage from '@/components/teaching/AssessmentListPage';
import DocumentsPage from '@/components/teaching/DocumentsPage';

/**
 * Every screen in TDMS. Each signed-in page loads its own data from
 * /api/v1/pages/<same path>, where the server decides whether the visitor
 * may see it at all; the routes here only decide which screen to draw.
 */

const Login = lazy(() => import('@/pages/auth/Login'));
const AccessCode = lazy(() => import('@/pages/auth/AccessCode'));
const ChangePassword = lazy(() => import('@/pages/auth/ChangePassword'));
const ForgotPassword = lazy(() => import('@/pages/auth/ForgotPassword'));
const ResetPassword = lazy(() => import('@/pages/auth/ResetPassword'));
const VerifyEmail = lazy(() => import('@/pages/auth/VerifyEmail'));
const Setup = lazy(() => import('@/pages/auth/Setup'));

const P0 = lazy(() => import('@/pages/app/academic-reviews'));
const P1 = lazy(() => import('@/pages/app/admin-access-codes'));
const P2 = lazy(() => import('@/pages/app/admins'));
const P3 = lazy(() => import('@/pages/app/applications'));
const P4 = lazy(() => import('@/pages/app/audit-logs'));
const P5 = lazy(() => import('@/pages/app/calendar'));
const P6 = lazy(() => import('@/pages/app/class-setup'));
const P7 = lazy(() => import('@/pages/app/curricula/_id'));
const P8 = lazy(() => import('@/pages/app/dashboard'));
const P9 = lazy(() => import('@/pages/app/enrollments'));
const P10 = lazy(() => import('@/pages/app/instructors'));
const P11 = lazy(() => import('@/pages/app/instructors/_id'));
const P12 = lazy(() => import('@/pages/app/learning-support'));
const P13 = lazy(() => import('@/pages/app/my/assessments'));
const P14 = lazy(() => import('@/pages/app/my/assessments/_id'));
const P15 = lazy(() => import('@/pages/app/my/attendance'));
const P16 = lazy(() => import('@/pages/app/my/badges'));
const P17 = lazy(() => import('@/pages/app/my/grades'));
const P18 = lazy(() => import('@/pages/app/my/qr'));
const P19 = lazy(() => import('@/pages/app/notifications'));
const P20 = lazy(() => import('@/pages/app/profile'));
const P21 = lazy(() => import('@/pages/app/programs'));
const P22 = lazy(() => import('@/pages/app/programs/_id'));
const P23 = lazy(() => import('@/pages/app/school-years'));
const P24 = lazy(() => import('@/pages/app/staff'));
const P25 = lazy(() => import('@/pages/app/status-requests'));
const P26 = lazy(() => import('@/pages/app/students'));
const P27 = lazy(() => import('@/pages/app/students/_id/enrollment'));
const P28 = lazy(() => import('@/pages/app/subjects'));
const P29 = lazy(() => import('@/pages/app/system-health'));
const P30 = lazy(() => import('@/pages/app/teaching/assessments/_id'));
const P31 = lazy(() => import('@/pages/app/teaching/assessments/_id/check'));
const P32 = lazy(() => import('@/pages/app/teaching/attendance-records'));
const P33 = lazy(() => import('@/pages/app/teaching/attendance'));
const P34 = lazy(() => import('@/pages/app/teaching/attendance/_id'));
const P35 = lazy(() => import('@/pages/app/teaching/badges'));
const P36 = lazy(() => import('@/pages/app/teaching/checking'));
const P37 = lazy(() => import('@/pages/app/teaching/classes'));
const P38 = lazy(() => import('@/pages/app/teaching/classes/_id'));
const P39 = lazy(() => import('@/pages/app/teaching/gradebook'));
const P40 = lazy(() => import('@/pages/app/teaching/learning-support'));
const P41 = lazy(() => import('@/pages/app/teaching/pds'));
const P42 = lazy(() => import('@/pages/app/teaching/progress'));
const P43 = lazy(() => import('@/pages/app/teaching/records'));
const P44 = lazy(() => import('@/pages/app/teaching/students'));
const P45 = lazy(() => import('@/pages/app/teaching/subjects'));

export default function App() {
  return (
    <GlobalError>
      <BrowserRouter>
        <Suspense fallback={null}>
          <Routes>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/login" element={<Login />} />
            <Route path="/login/access-code" element={<AccessCode />} />
            <Route path="/change-password" element={<ChangePassword />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/verify-email" element={<VerifyEmail />} />
            <Route path="/setup" element={<Setup />} />
            {/* Retired: the first Super Admin is created at /setup. */}
            <Route path="/create-super-admin" element={<Navigate to="/setup" replace />} />

            <Route element={<AppLayout />}>
              <Route path="/academic-reviews" element={<P0 />} />
              <Route path="/admin-access-codes" element={<P1 />} />
              <Route path="/admins" element={<P2 />} />
              <Route path="/applications" element={<P3 />} />
              <Route path="/audit-logs" element={<P4 />} />
              <Route path="/calendar" element={<P5 />} />
              <Route path="/class-setup" element={<P6 />} />
              <Route path="/curricula/:id" element={<P7 />} />
              <Route path="/dashboard" element={<P8 />} />
              <Route path="/enrollments" element={<P9 />} />
              <Route path="/instructors" element={<P10 />} />
              <Route path="/instructors/:id" element={<P11 />} />
              <Route path="/learning-support" element={<P12 />} />
              <Route path="/my/assessments" element={<P13 />} />
              <Route path="/my/assessments/:id" element={<P14 />} />
              <Route path="/my/attendance" element={<P15 />} />
              <Route path="/my/badges" element={<P16 />} />
              <Route path="/my/grades" element={<P17 />} />
              <Route path="/my/qr" element={<P18 />} />
              <Route path="/notifications" element={<P19 />} />
              <Route path="/profile" element={<P20 />} />
              <Route path="/programs" element={<P21 />} />
              <Route path="/programs/:id" element={<P22 />} />
              <Route path="/school-years" element={<P23 />} />
              <Route path="/staff" element={<P24 />} />
              <Route path="/status-requests" element={<P25 />} />
              <Route path="/students" element={<P26 />} />
              <Route path="/students/:id/enrollment" element={<P27 />} />
              <Route path="/subjects" element={<P28 />} />
              <Route path="/system-health" element={<P29 />} />
              <Route path="/teaching/assessments/:id" element={<P30 />} />
              <Route path="/teaching/assessments/:id/check" element={<P31 />} />
              <Route path="/teaching/attendance-records" element={<P32 />} />
              <Route path="/teaching/attendance" element={<P33 />} />
              <Route path="/teaching/attendance/:id" element={<P34 />} />
              <Route path="/teaching/badges" element={<P35 />} />
              <Route path="/teaching/checking" element={<P36 />} />
              <Route path="/teaching/classes" element={<P37 />} />
              <Route path="/teaching/classes/:id" element={<P38 />} />
              <Route path="/teaching/gradebook" element={<P39 />} />
              <Route path="/teaching/learning-support" element={<P40 />} />
              <Route path="/teaching/pds" element={<P41 />} />
              <Route path="/teaching/progress" element={<P42 />} />
              <Route path="/teaching/records" element={<P43 />} />
              <Route path="/teaching/students" element={<P44 />} />
              <Route path="/teaching/subjects" element={<P45 />} />
              <Route path="/teaching/quizzes" element={<AssessmentListPage kind="QUIZ" endpoint="/teaching/quizzes" />} />
              <Route path="/teaching/exams" element={<AssessmentListPage kind="EXAM" endpoint="/teaching/exams" />} />
              <Route path="/teaching/activities" element={<AssessmentListPage kind="ACTIVITY" endpoint="/teaching/activities" />} />
              <Route path="/teaching/performance-tasks" element={<AssessmentListPage kind="PT" endpoint="/teaching/performance-tasks" />} />
              <Route path="/teaching/documents/lesson-plans" element={<DocumentsPage kind="LESSON_PLAN" endpoint="/teaching/documents/lesson-plans" />} />
              <Route path="/teaching/documents/tos" element={<DocumentsPage kind="TOS" endpoint="/teaching/documents/tos" />} />
              <Route path="/teaching/documents/pt" element={<DocumentsPage kind="PT" endpoint="/teaching/documents/pt" />} />
            </Route>

            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </GlobalError>
  );
}
