import { useState, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Spinner } from '@/components/ui/spinner'
import { Switch } from '@/components/ui/switch'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { EmojiPicker, MoneyInput } from '@/components/inputs'
import { patch, post } from '@/lib/api'
import { centsToInput, parseDollars } from '@/lib/format'
import { useApiMutation } from '@/lib/queries'
import type { Challenge, Contact, Pot, Recurrence, Relationship } from '@/lib/types'

export function ChallengeDialog({
  childId,
  pots,
  challenge,
  trigger,
}: {
  childId: string
  pots: Pot[]
  challenge?: Challenge
  trigger: ReactNode
}) {
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [emoji, setEmoji] = useState('🧹')
  const [reward, setReward] = useState('')
  const [recurrence, setRecurrence] = useState<Recurrence>('weekly')
  const [potId, setPotId] = useState('default')

  const reset = () => {
    setTitle(challenge?.title ?? '')
    setEmoji(challenge?.emoji ?? '🧹')
    setReward(centsToInput(challenge?.rewardCents ?? 100))
    setRecurrence(challenge?.recurrence ?? 'weekly')
    setPotId(challenge?.potId ?? 'default')
  }

  const rewardCents = reward === '' ? 0 : parseDollars(reward)
  const invalid = rewardCents === null || rewardCents > 10_000

  const save = useApiMutation(
    () => {
      const body = { title: title.trim(), emoji, rewardCents, recurrence, potId: potId === 'default' ? null : potId }
      return challenge ? patch(`/challenges/${challenge.id}`, body) : post(`/children/${childId}/challenges`, body)
    },
    { success: challenge ? 'Challenge updated' : `${emoji} ${title.trim()} added`, onSuccess: () => setOpen(false) },
  )

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o)
        if (o) reset()
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (title.trim() && !invalid) save.mutate(undefined)
          }}
        >
          <DialogHeader>
            <DialogTitle>{challenge ? 'Edit challenge' : 'New chore or challenge'}</DialogTitle>
            <DialogDescription>Your child marks it done in the app; you approve it and the reward is paid.</DialogDescription>
          </DialogHeader>
          <FieldGroup className="py-5">
            <Field>
              <FieldLabel htmlFor="ch-title">What needs doing?</FieldLabel>
              <div className="flex gap-2">
                <EmojiPicker value={emoji} onChange={setEmoji} set="chores" />
                <Input id="ch-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Tidy bedroom" required maxLength={60} autoFocus />
              </div>
            </Field>
            <Field>
              <FieldLabel>How often?</FieldLabel>
              <ToggleGroup type="single" variant="outline" value={recurrence} onValueChange={(v) => v && setRecurrence(v as Recurrence)} className="w-full">
                <ToggleGroupItem value="once" className="flex-1">
                  One-off
                </ToggleGroupItem>
                <ToggleGroupItem value="daily" className="flex-1">
                  Daily
                </ToggleGroupItem>
                <ToggleGroupItem value="weekly" className="flex-1">
                  Weekly
                </ToggleGroupItem>
              </ToggleGroup>
              <FieldDescription>
                {recurrence === 'once' ? 'Can be completed once.' : `Can be completed once per ${recurrence === 'daily' ? 'day' : 'week'}.`}
              </FieldDescription>
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field data-invalid={invalid || undefined}>
                <FieldLabel htmlFor="ch-reward">Reward</FieldLabel>
                <MoneyInput id="ch-reward" value={reward} onChange={setReward} invalid={invalid} placeholder="0" />
                {invalid ? <FieldError>Up to $100</FieldError> : null}
              </Field>
              <Field>
                <FieldLabel htmlFor="ch-pot">Paid into</FieldLabel>
                <Select value={potId} onValueChange={setPotId}>
                  <SelectTrigger id="ch-pot" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="default">Spending pot</SelectItem>
                    {pots
                      .filter((p) => !p.isSpending)
                      .map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.emoji} {p.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>
          </FieldGroup>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!title.trim() || invalid || save.isPending}>
              {save.isPending ? <Spinner /> : null} {challenge ? 'Save' : 'Add challenge'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export function ContactDialog({ childId, contact, trigger }: { childId: string; contact?: Contact; trigger: ReactNode }) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [avatar, setAvatar] = useState('🙂')
  const [relationship, setRelationship] = useState<Relationship>('friend')
  const [favorite, setFavorite] = useState(false)

  const save = useApiMutation(
    () => {
      const body = { name: name.trim(), avatar, relationship, isFavorite: favorite }
      return contact ? patch(`/contacts/${contact.id}`, body) : post(`/children/${childId}/contacts`, body)
    },
    { success: contact ? 'Contact updated' : `${name.trim()} added to contacts`, onSuccess: () => setOpen(false) },
  )

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o)
        if (o) {
          setName(contact?.name ?? '')
          setAvatar(contact?.avatar ?? '🙂')
          setRelationship(contact?.relationship ?? 'friend')
          setFavorite(contact?.isFavorite ?? false)
        }
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (name.trim()) save.mutate(undefined)
          }}
        >
          <DialogHeader>
            <DialogTitle>{contact ? 'Edit contact' : 'Add a contact'}</DialogTitle>
            <DialogDescription>Approved people your child can send money to. Parents can also be asked for money.</DialogDescription>
          </DialogHeader>
          <FieldGroup className="py-5">
            <Field>
              <FieldLabel htmlFor="ct-name">Name</FieldLabel>
              <div className="flex gap-2">
                <EmojiPicker value={avatar} onChange={setAvatar} set="people" label="Avatar" />
                <Input id="ct-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. James F" required maxLength={60} autoFocus />
              </div>
            </Field>
            <Field>
              <FieldLabel>Relationship</FieldLabel>
              <ToggleGroup type="single" variant="outline" value={relationship} onValueChange={(v) => v && setRelationship(v as Relationship)} className="w-full">
                <ToggleGroupItem value="parent" className="flex-1">
                  Parent
                </ToggleGroupItem>
                <ToggleGroupItem value="family" className="flex-1">
                  Family
                </ToggleGroupItem>
                <ToggleGroupItem value="friend" className="flex-1">
                  Friend
                </ToggleGroupItem>
              </ToggleGroup>
            </Field>
            <Field orientation="horizontal">
              <Switch id="ct-fav" checked={favorite} onCheckedChange={setFavorite} />
              <FieldLabel htmlFor="ct-fav" className="font-normal">
                Show in Favorites
              </FieldLabel>
            </Field>
          </FieldGroup>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!name.trim() || save.isPending}>
              {save.isPending ? <Spinner /> : null} {contact ? 'Save' : 'Add contact'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
