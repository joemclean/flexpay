import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from '@/components/ui/input-group'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'

/** Dollar amount field; value is the raw text (parse with parseDollars on submit). */
export function MoneyInput({
  id,
  value,
  onChange,
  placeholder = '0.00',
  invalid,
  autoFocus,
}: {
  id?: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  invalid?: boolean
  autoFocus?: boolean
}) {
  return (
    <InputGroup>
      <InputGroupAddon>
        <InputGroupText>$</InputGroupText>
      </InputGroupAddon>
      <InputGroupInput
        id={id}
        inputMode="decimal"
        autoComplete="off"
        placeholder={placeholder}
        value={value}
        autoFocus={autoFocus}
        aria-invalid={invalid || undefined}
        onChange={(e) => onChange(e.target.value.replace(/[^\d.]/g, ''))}
        className="tabular"
      />
    </InputGroup>
  )
}

const EMOJI_SETS: Record<string, string[]> = {
  kids: ['🐶', '🦊', '🐱', '🐼', '🦁', '🐯', '🐸', '🐵', '🦄', '🐙', '🐢', '🐰', '🐻', '🐨', '🐧', '🦖'],
  goals: ['💰', '🚲', '🎮', '😎', '🎨', '🐾', '📱', '⚽️', '🎸', '🛹', '🎁', '✈️', '🏖️', '👟', '📚', '🧸'],
  chores: ['🧹', '🐕', '📚', '🚗', '🍽️', '🐱', '🎹', '🛏️', '🧺', '🌱', '🗑️', '🧽', '🦷', '🏃', '⭐️', '🎯'],
  people: ['👩', '👨', '👵', '👴', '🧢', '🎸', '🌸', '🦄', '🏀', '🎮', '🐰', '🚀', '⚽️', '🎨', '🙂', '😎'],
}

export function EmojiPicker({
  value,
  onChange,
  set = 'goals',
  label = 'Choose emoji',
}: {
  value: string
  onChange: (emoji: string) => void
  set?: keyof typeof EMOJI_SETS
  label?: string
}) {
  const [open, setOpen] = useState(false)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" className="size-10 shrink-0 p-0 text-xl" aria-label={`${label}: ${value}`}>
          {value}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-2" align="start">
        <div className="grid grid-cols-8 gap-1" role="listbox" aria-label={label}>
          {EMOJI_SETS[set]!.map((e) => (
            <button
              key={e}
              type="button"
              role="option"
              aria-selected={e === value}
              onClick={() => {
                onChange(e)
                setOpen(false)
              }}
              className={cn(
                'flex size-7 items-center justify-center rounded-md text-lg hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
                e === value && 'bg-accent ring-1 ring-primary',
              )}
            >
              {e}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}
