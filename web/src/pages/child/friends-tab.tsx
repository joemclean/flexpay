import { PencilIcon, StarIcon, Trash2Icon, UserPlusIcon, UsersIcon } from 'lucide-react'
import { EmojiAvatar, EmptyState, ErrorState, ListSkeleton } from '@/components/common'
import { Confirm } from '@/components/confirm'
import { ContactDialog } from '@/components/dialogs/activity-dialogs'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from '@/components/ui/item'
import { del } from '@/lib/api'
import { fromNow, money } from '@/lib/format'
import { useApiMutation, useContacts, useMoneyRequests } from '@/lib/queries'
import type { ChildDetail, Contact } from '@/lib/types'

const REL_LABEL = { parent: 'Parent', family: 'Family', friend: 'Friend' } as const
const REQ_STATUS = {
  pending: { label: 'Waiting', variant: 'default' },
  approved: { label: 'Approved', variant: 'secondary' },
  declined: { label: 'Declined', variant: 'outline' },
  canceled: { label: 'Canceled', variant: 'outline' },
} as const

function ContactRow({ child, contact }: { child: ChildDetail; contact: Contact }) {
  const remove = useApiMutation(() => del(`/contacts/${contact.id}`), { success: `${contact.name} removed` })
  return (
    <Item variant="outline" size="sm">
      <ItemMedia>
        <EmojiAvatar emoji={contact.avatar} />
      </ItemMedia>
      <ItemContent>
        <ItemTitle className="flex-wrap">
          {contact.name}
          {contact.isFavorite ? <StarIcon className="size-3.5 fill-warning text-warning" aria-label="Favorite" /> : null}
        </ItemTitle>
        <ItemDescription>
          {REL_LABEL[contact.relationship]}
          {contact.relationship === 'parent' ? ' · can be asked for money' : ''}
        </ItemDescription>
      </ItemContent>
      <ItemActions>
        <ContactDialog
          childId={child.id}
          contact={contact}
          trigger={
            <Button size="icon-sm" variant="ghost" aria-label={`Edit ${contact.name}`}>
              <PencilIcon />
            </Button>
          }
        />
        <Confirm
          title={`Remove ${contact.name}?`}
          description={`${child.name} won’t be able to send money to ${contact.name}. Pending requests to them will be canceled.`}
          confirmLabel="Remove"
          onConfirm={() => remove.mutate(undefined)}
          trigger={
            <Button size="icon-sm" variant="ghost" aria-label={`Remove ${contact.name}`}>
              <Trash2Icon />
            </Button>
          }
        />
      </ItemActions>
    </Item>
  )
}

export function FriendsTab({ child }: { child: ChildDetail }) {
  const contacts = useContacts(child.id)
  const requests = useMoneyRequests(child.id)
  const favorites = contacts.data?.filter((c) => c.isFavorite) ?? []
  const others = contacts.data?.filter((c) => !c.isFavorite) ?? []

  return (
    <div className="grid gap-4 lg:grid-cols-5">
      <Card className="lg:col-span-3">
        <CardHeader>
          <CardTitle>Contacts</CardTitle>
          <CardDescription>The people {child.name} can send money to in the app. You approve every payment.</CardDescription>
          <CardAction>
            <ContactDialog
              childId={child.id}
              trigger={
                <Button size="sm">
                  <UserPlusIcon /> Add
                </Button>
              }
            />
          </CardAction>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          {contacts.isError ? (
            <ErrorState error={contacts.error} onRetry={() => void contacts.refetch()} />
          ) : contacts.isPending ? (
            <ListSkeleton rows={4} />
          ) : contacts.data.length === 0 ? (
            <EmptyState icon={<UsersIcon />} title="No contacts yet" description="Add yourself as “Mum” or “Dad”, plus a few friends." />
          ) : (
            <>
              {favorites.length ? (
                <section>
                  <h3 className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Favorites</h3>
                  <ItemGroup className="gap-2">
                    {favorites.map((c) => (
                      <ContactRow key={c.id} child={child} contact={c} />
                    ))}
                  </ItemGroup>
                </section>
              ) : null}
              {others.length ? (
                <section>
                  <h3 className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Everyone else</h3>
                  <ItemGroup className="gap-2">
                    {others.map((c) => (
                      <ContactRow key={c.id} child={child} contact={c} />
                    ))}
                  </ItemGroup>
                </section>
              ) : null}
            </>
          )}
        </CardContent>
      </Card>
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle>Send &amp; ask history</CardTitle>
          <CardDescription>Money {child.name} sent or asked for.</CardDescription>
        </CardHeader>
        <CardContent>
          {requests.isPending ? (
            <ListSkeleton rows={4} />
          ) : !requests.data?.length ? (
            <p className="text-sm text-muted-foreground">No requests yet.</p>
          ) : (
            <ul className="divide-y">
              {requests.data.map((r) => (
                <li key={r.id} className="flex items-center gap-3 py-2.5">
                  <EmojiAvatar emoji={r.contactAvatar ?? '🙂'} className="size-8 text-base" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {r.direction === 'send' ? `Send to ${r.contactName}` : `Ask ${r.contactName}`}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {r.note ? `“${r.note}” · ` : ''}
                      {fromNow(r.createdAt)}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span className="tabular text-sm font-medium">{money(r.amountCents)}</span>
                    <Badge variant={REQ_STATUS[r.status].variant}>{REQ_STATUS[r.status].label}</Badge>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
