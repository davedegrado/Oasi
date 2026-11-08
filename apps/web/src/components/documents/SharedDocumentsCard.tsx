import { Download, FolderOpen } from 'lucide-react'
import type { SharedDocument } from '@/types'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useDatabase } from '@/hooks/useDatabase'
import { fmtDay, openDocumentFile } from './documentUtils'

/** Documenti messi a disposizione dalla palestra: regolamento, moduli da stampare */
export function SharedDocumentsCard({ audience }: { audience: SharedDocument['audience'] }) {
  const db = useDatabase()
  const docs = (db.sharedDocuments ?? []).filter((d) => d.audience === 'tutti' || d.audience === audience)
  if (!docs.length) return null
  return (
    <Card>
      <CardContent>
        <h2 className="mb-1 flex items-center gap-2 text-base font-bold">
          <FolderOpen className="size-4 text-rosa-intenso" /> Documenti della palestra
        </h2>
        <p className="mb-3 text-sm text-ink-muted">Regolamento e moduli da scaricare.</p>
        <ul className="divide-y divide-line/70">
          {docs.map((d) => (
            <li key={d.id} className="flex items-center gap-3 py-3">
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{d.title}</p>
                <p className="text-xs text-ink-muted">
                  {d.description} · {fmtDay(d.uploadedAt)}
                </p>
              </div>
              <Button size="icon" variant="outline" aria-label={`Scarica ${d.title}`} onClick={() => openDocumentFile(d.fileData, d.fileName)}>
                <Download />
              </Button>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}
