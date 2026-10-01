import { KeyRoundIcon, LockKeyholeOpenIcon, SmartphoneIcon, Trash2Icon } from 'lucide-react'
import { useState } from 'react'
import { EmptyState } from '@/components/common'
import { Confirm } from '@/components/confirm'
import { PairingDialog, PinDialog } from '@/components/dialogs/card-device-dialogs'
import { EmojiPicker } from '@/components/inputs'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from '@/components/ui/item'
import { Spinner } from '@/components/ui/spinner'
import { del, patch } from '@/lib/api'
import { fromNow } from '@/lib/format'
import { useApiMutation } from '@/lib/queries'
import type { ChildDetail } from '@/lib/types'

function ProfileCard({ child }: { child: ChildDetail }) {
  const [name, setName] = useState(child.name)
  const [avatar, setAvatar] = useState(child.avatar)
  const [birthYear, setBirthYear] = useState(child.birthYear ? String(child.birthYear) : '')
  const thisYear = new Date().getFullYear()
  const yearInvalid = birthYear !== '' && (Number(birthYear) < thisYear - 19 || Number(birthYear) > thisYear)
  const dirty = name.trim() !== child.name || avatar !== child.avatar || birthYear !== (child.birthYear ? String(child.birthYear) : '')
  const save = useApiMutation(
    () => patch(`/children/${child.id}`, { name: name.trim(), avatar, birthYear: birthYear ? Number(birthYear) : null }),
    { success: 'Profile saved' },
  )
  return (
    <Card className="h-fit">
      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (name.trim() && !yearInvalid) save.mutate(undefined)
        }}
        className="flex flex-col gap-6"
      >
        <CardHeader>
          <CardTitle>Profile</CardTitle>
          <CardDescription>How {child.name} appears in the app.</CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="profile-name">Name</FieldLabel>
              <div className="flex gap-2">
                <EmojiPicker value={avatar} onChange={setAvatar} set="kids" label="Avatar" />
                <Input id="profile-name" value={name} onChange={(e) => setName(e.target.value)} required maxLength={60} />
              </div>
            </Field>
            <Field data-invalid={yearInvalid || undefined}>
              <FieldLabel htmlFor="profile-year">Birth year</FieldLabel>
              <Input
                id="profile-year"
                inputMode="numeric"
                value={birthYear}
                onChange={(e) => setBirthYear(e.target.value.replace(/\D/g, '').slice(0, 4))}
                aria-invalid={yearInvalid || undefined}
                className="max-w-32"
              />
              {yearInvalid ? <FieldError>Enter a year between {thisYear - 19} and {thisYear}</FieldError> : null}
            </Field>
          </FieldGroup>
        </CardContent>
        <CardFooter>
          <Button type="submit" disabled={!dirty || !name.trim() || yearInvalid || save.isPending}>
            {save.isPending ? <Spinner /> : null} Save
          </Button>
        </CardFooter>
      </form>
    </Card>
  )
}

function SecurityCard({ child }: { child: ChildDetail }) {
  const reset = useApiMutation(() => del(`/children/${child.id}/pin`), {
    success: `PIN cleared — ${child.name} will create a new one next time they open the app`,
  })
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <KeyRoundIcon className="size-5 text-brand-text" /> App PIN
        </CardTitle>
        <CardDescription>{child.name} unlocks FlexFund Kids with a 4-digit PIN (or Face ID once set up).</CardDescription>
      </CardHeader>
      <CardContent className="flex items-center gap-2">
        {child.hasPin ? <Badge variant="secondary">PIN is set</Badge> : <Badge variant="outline">No PIN yet</Badge>}
        <span className="text-sm text-muted-foreground">{child.hasPin ? 'Forgotten? Change it or clear it below.' : `${child.name} will create one on first launch.`}</span>
      </CardContent>
      <CardFooter className="flex-wrap gap-2">
        <PinDialog childId={child.id} childName={child.name} hasPin={child.hasPin} trigger={<Button variant="outline">{child.hasPin ? 'Change PIN' : 'Set PIN'}</Button>} />
        {child.hasPin ? (
          <Confirm
            title="Clear the PIN?"
            description={`${child.name} will be signed out and asked to create a new PIN on their device.`}
            confirmLabel="Clear PIN"
            onConfirm={() => reset.mutate(undefined)}
            trigger={
              <Button variant="ghost">
                <LockKeyholeOpenIcon /> Let {child.name} choose a new PIN
              </Button>
            }
          />
        ) : null}
      </CardFooter>
    </Card>
  )
}

function DevicesCard({ child }: { child: ChildDetail }) {
  const revoke = useApiMutation((id: string) => del(`/devices/${id}`), { success: 'Device disconnected' })
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <SmartphoneIcon className="size-5 text-brand-text" /> Devices
        </CardTitle>
        <CardDescription>iPhones signed in to FlexFund Kids as {child.name}.</CardDescription>
      </CardHeader>
      <CardContent>
        {child.devices.length === 0 ? (
          <EmptyState
            icon={<SmartphoneIcon />}
            title="No device connected"
            description={`Generate a code, then enter it in FlexFund Kids on ${child.name}’s iPhone.`}
            className="py-6"
          />
        ) : (
          <ItemGroup className="gap-2">
            {child.devices.map((d) => (
              <Item key={d.id} variant="outline" size="sm">
                <ItemMedia variant="icon">
                  <SmartphoneIcon />
                </ItemMedia>
                <ItemContent>
                  <ItemTitle>{d.name}</ItemTitle>
                  <ItemDescription>
                    Connected {fromNow(d.createdAt)} · last active {fromNow(d.lastSeenAt)}
                  </ItemDescription>
                </ItemContent>
                <ItemActions>
                  <Confirm
                    title={`Disconnect ${d.name}?`}
                    description={`${child.name} will be signed out on this device and need a new pairing code to reconnect.`}
                    confirmLabel="Disconnect"
                    onConfirm={() => revoke.mutate(d.id)}
                    trigger={
                      <Button size="sm" variant="ghost" className="text-destructive">
                        <Trash2Icon /> Disconnect
                      </Button>
                    }
                  />
                </ItemActions>
              </Item>
            ))}
          </ItemGroup>
        )}
      </CardContent>
      <CardFooter>
        <PairingDialog childId={child.id} childName={child.name} trigger={<Button>Connect a device</Button>} />
      </CardFooter>
    </Card>
  )
}

export function ChildSettingsTab({ child }: { child: ChildDetail }) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <ProfileCard key={`${child.name}-${child.avatar}-${child.birthYear}`} child={child} />
      <div className="flex flex-col gap-4">
        <SecurityCard child={child} />
        <DevicesCard child={child} />
      </div>
    </div>
  )
}
