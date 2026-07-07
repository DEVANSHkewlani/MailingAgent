/**
 * Button component — single source of truth for all button variants.
 * Ported from Hermes Agent's button.tsx with CVA.
 */

import { cva, type VariantProps } from 'class-variance-authority'
import { forwardRef, type ButtonHTMLAttributes } from 'react'
import { cn } from '../../lib/utils'

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap font-medium transition-colors disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:brightness-110',
        destructive: 'bg-destructive text-destructive-foreground hover:brightness-110',
        secondary: 'bg-(--ui-bg-quaternary) text-(--ui-text-secondary) hover:bg-(--ui-bg-tertiary) hover:text-(--ui-text-primary)',
        outline: 'border border-(--ui-stroke-secondary) bg-transparent hover:bg-(--chrome-action-hover) hover:text-foreground',
        ghost: 'bg-transparent hover:bg-(--chrome-action-hover) hover:text-foreground',
        link: 'text-primary underline-offset-4 hover:underline',
        text: 'bg-transparent text-(--ui-text-secondary) hover:text-(--ui-text-primary) px-0',
      },
      size: {
        default: 'h-8 rounded-md px-3 text-[0.8125rem]',
        sm: 'h-7 rounded-md px-2.5 text-xs',
        lg: 'h-10 rounded-md px-4 text-sm',
        icon: 'size-8 rounded-md',
        'icon-sm': 'size-7 rounded-md',
        'icon-xs': 'size-6 rounded-md',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
)

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => (
    <button
      className={cn(buttonVariants({ variant, size, className }))}
      ref={ref}
      {...props}
    />
  ),
)

Button.displayName = 'Button'

export { buttonVariants }
