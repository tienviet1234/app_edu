import { useState } from 'react'
import { AdminLayout } from './AdminLayout'
import { AdminDashboard } from './AdminDashboard'
import { UsersPage } from './UsersPage'
import { AuditLogPage } from './AuditLogPage'
import { CoursesPage } from './CoursesPage'
import { AnalyticsPage } from './AnalyticsPage'
import { RubricEditor } from './RubricEditor'

export function AdminPage() {
  const [page, setPage] = useState('dashboard')

  return (
    <AdminLayout page={page} setPage={setPage}>
      {page === 'dashboard'  && <AdminDashboard />}
      {page === 'users'      && <UsersPage />}
      {page === 'courses'    && <CoursesPage />}
      {page === 'rubric'     && <RubricEditor />}
      {page === 'analytics'  && <AnalyticsPage />}
      {page === 'audit'      && <AuditLogPage />}
    </AdminLayout>
  )
}
