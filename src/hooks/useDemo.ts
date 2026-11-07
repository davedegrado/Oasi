import { useContext } from 'react'
import { DemoContext } from '@/context/demo-context'
import { useDatabase } from './useDatabase'
import { findStudent, findTeacher } from '@/services/selectors'

export function useDemo() {
  const ctx = useContext(DemoContext)
  if (!ctx) throw new Error('useDemo deve essere usato dentro DemoProvider')
  return ctx
}

/** Allieva impersonata nella demo */
export function useCurrentStudent() {
  const { persona } = useDemo()
  const db = useDatabase()
  return findStudent(db, persona?.userId) ?? db.students[0]
}

/** Insegnante impersonata nella demo */
export function useCurrentTeacher() {
  const { persona } = useDemo()
  const db = useDatabase()
  return findTeacher(db, persona?.userId) ?? db.teachers[0]
}
