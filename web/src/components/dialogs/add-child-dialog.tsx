import { useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'
import { EmojiPicker } from '@/components/inputs'
import { post } from '@/lib/api'
import { useApiMutation } from '@/lib/queries'
import type { ChildDetail } from '@/lib/types'

export function AddChildDialog({ trigger }: { trigger: ReactNode }) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [avatar, setAvatar] = useState('🐶')
  const [birthYear, setBirthYear] = useState('')
  const [pin, setPin] = useState('')
  const navigate = useNavigate()
  const thisYear = new Date().getFullYear()

  const create = useApiMutation(
    () =>
      post<ChildDetail>('/children', {
        name: name.trim(),
        avatar,
        birthYear: birthYear ? Number(birthYear) : null,
        ...(pin ? { pin } : {}),
      }),
    {
      success: (c) => `${c.name} added — their General pot and Purchase Card are ready`,
      onSuccess: (c) => {
        setOpen(false)
        setName('')
        setBirthYear('')
        setPin('')
        navigate(`/children/${c.id}/settings`)
      },
    },
  )

  const pinInvalid = pin.length > 0 && !/^\d{4}$/.test(pin)
  const yearInvalid = birthYear !== '' && (Number(birthYear) < thisYear - 19 || Number(birthYear) > thisYear)

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (!name.trim() || pinInvalid || yearInvalid) return
            create.mutate(undefined)
          }}
        >
          <DialogHeader>
            <DialogTitle>Add a child</DialogTitle>
            <DialogDescription>We’ll create a General spending pot and a Purchase Card for them.</DialogDescription>
          </DialogHeader>
          <FieldGroup className="py-5">
            <Field>
              <FieldLabel htmlFor="child-name">Name</FieldLabel>
              <div className="flex gap-2">
                <EmojiPicker value={avatar} onChange={setAvatar} set="kids" label="Avatar" />
                <Input id="child-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Finn" required autoFocus maxLength={60} />
              </div>
            </Field>
            <Field data-invalid={yearInvalid || undefined}>
              <FieldLabel htmlFor="child-year">Birth year (optional)</FieldLabel>
              <Input
                id="child-year"
                inputMode="numeric"
                placeholder={String(thisYear - 9)}
                value={birthYear}
                onChange={(e) => setBirthYear(e.target.value.replace(/\D/g, '').slice(0, 4))}
                aria-invalid={yearInvalid || undefined}
              />
            </Field>
            <Field data-invalid={pinInvalid || undefined}>
              <FieldLabel htmlFor="child-pin">4-digit PIN (optional)</FieldLabel>
              <Input
                id="child-pin"
                inputMode="numeric"
                autoComplete="off"
                placeholder="••••"
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                aria-invalid={pinInvalid || undefined}
                className="tracking-[0.4em]"
              />
              <FieldDescription>Leave blank and your child will create their own PIN when they first open the app.</FieldDescription>
            </Field>
          </FieldGroup>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!name.trim() || pinInvalid || yearInvalid || create.isPending}>
              {create.isPending ? <Spinner /> : null} Add child
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
