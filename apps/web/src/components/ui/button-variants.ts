import { cva } from 'class-variance-authority'

export const buttonVariants = cva(
  'inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-full font-semibold transition-all duration-200 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        primary: 'bg-rosa-intenso text-white shadow-soft hover:bg-rosa-scuro',
        dark: 'bg-ink text-white hover:bg-ink/90',
        soft: 'bg-cipria text-rosa-scuro hover:bg-rosa/40',
        outline: 'border border-line bg-white text-ink hover:border-rosa hover:bg-cipria-50',
        ghost: 'text-ink-soft hover:bg-cipria-100 hover:text-ink',
        danger: 'bg-danger-soft text-danger hover:bg-danger hover:text-white',
      },
      size: {
        sm: 'h-9 px-3.5 text-sm',
        md: 'h-11 px-5 text-sm',
        lg: 'h-13 px-6 text-base',
        icon: 'size-10',
        'icon-sm': 'size-8 [&_svg]:size-3.5',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
)
