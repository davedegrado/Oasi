import { cn, initials } from '@/lib/utils'

const GRADIENTS = [
  'from-cipria to-rosa',
  'from-rosa to-rosa-intenso',
  'from-tessuti-soft to-tessuti',
  'from-cipria-100 to-rosa-intenso',
  'from-warn-soft to-rosa',
  'from-ok-soft to-tessuti',
]

function pick(id: string) {
  let n = 0
  for (const c of id) n = (n + c.charCodeAt(0)) % GRADIENTS.length
  return GRADIENTS[n]
}

interface AvatarProps {
  person: { id: string; firstName: string; lastName: string; avatar?: string }
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl'
  className?: string
  ring?: boolean
}

const SIZES = {
  xs: 'size-7 text-[10px]',
  sm: 'size-9 text-xs',
  md: 'size-11 text-sm',
  lg: 'size-16 text-lg',
  xl: 'size-24 text-2xl',
}

export function Avatar({ person, size = 'md', className, ring }: AvatarProps) {
  return (
    <span
      className={cn(
        'relative inline-grid shrink-0 place-items-center overflow-hidden rounded-full bg-gradient-to-br font-display font-bold text-white',
        pick(person.id),
        SIZES[size],
        ring && 'ring-4 ring-white',
        className,
      )}
      aria-hidden
    >
      {person.avatar ? <img src={person.avatar} alt="" className="size-full object-cover" /> : initials(person)}
    </span>
  )
}

export function AvatarStack({ people, max = 4, size = 'xs' }: { people: AvatarProps['person'][]; max?: number; size?: AvatarProps['size'] }) {
  const shown = people.slice(0, max)
  const rest = people.length - shown.length
  return (
    <div className="flex -space-x-2">
      {shown.map((p) => (
        <Avatar key={p.id} person={p} size={size} ring />
      ))}
      {rest > 0 && (
        <span className={cn('inline-grid place-items-center rounded-full bg-cipria font-bold text-rosa-scuro ring-4 ring-white', SIZES[size])}>+{rest}</span>
      )}
    </div>
  )
}
