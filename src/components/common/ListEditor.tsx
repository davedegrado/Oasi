import { useState } from 'react'
import { Plus, X } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

interface ListEditorProps {
  id: string
  items: string[]
  onChange: (items: string[]) => void
  placeholder: string
  suggestions?: string[]
}

/** Editor di liste testuali (punti di attenzione, prerequisiti, obiettivi) */
export function ListEditor({ id, items, onChange, placeholder, suggestions }: ListEditorProps) {
  const [draft, setDraft] = useState('')
  const add = () => {
    const v = draft.trim()
    if (!v || items.includes(v)) return
    onChange([...items, v])
    setDraft('')
  }
  return (
    <div>
      {items.length > 0 && (
        <ul className="mb-2.5 flex flex-wrap gap-2">
          {items.map((item) => (
            <li key={item} className="inline-flex max-w-full items-center gap-1 rounded-full bg-cipria-100 py-1 pr-1 pl-3 text-sm text-ink">
              <span className="truncate">{item}</span>
              <button type="button" onClick={() => onChange(items.filter((i) => i !== item))} className="grid size-6 shrink-0 place-items-center rounded-full text-ink-muted hover:bg-white hover:text-danger" aria-label={`Rimuovi ${item}`}>
                <X className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex gap-2">
        <Input
          id={id}
          value={draft}
          list={suggestions ? `${id}-suggestions` : undefined}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              add()
            }
          }}
          placeholder={placeholder}
        />
        <Button variant="soft" size="icon" className="size-11" onClick={add} aria-label="Aggiungi" disabled={!draft.trim()}>
          <Plus />
        </Button>
      </div>
      {suggestions && (
        <datalist id={`${id}-suggestions`}>
          {suggestions.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
      )}
    </div>
  )
}
