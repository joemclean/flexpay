import { ArchiveIcon, ArrowLeftRightIcon, PencilIcon, PlusIcon } from 'lucide-react'
import { Confirm } from '@/components/confirm'
import { DepositDialog, PotDialog, TransferDialog } from '@/components/dialogs/pot-dialogs'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardFooter } from '@/components/ui/card'
import { del } from '@/lib/api'
import { money } from '@/lib/format'
import { useApiMutation } from '@/lib/queries'
import type { ChildDetail, Pot } from '@/lib/types'
import { PotCardBody } from './overview-tab'

function PotCard({ child, pot }: { child: ChildDetail; pot: Pot }) {
  const archive = useApiMutation(() => del(`/pots/${pot.id}`), {
    success: pot.balanceCents > 0 ? `${pot.name} closed — ${money(pot.balanceCents)} moved to General` : `${pot.name} closed`,
  })
  return (
    <Card className="h-full gap-0 py-5" data-testid={`pot-${pot.name}`}>
      <CardContent className="flex-1 px-5">
        <PotCardBody pot={pot} />
      </CardContent>
      <CardFooter className="mt-4 gap-2 px-5">
        <DepositDialog
          childId={child.id}
          childName={child.name}
          pots={child.pots}
          defaultPotId={pot.id}
          trigger={
            <Button size="sm" variant="secondary">
              <PlusIcon /> Add
            </Button>
          }
        />
        <TransferDialog
          childId={child.id}
          pots={child.pots}
          defaultFrom={pot.isSpending ? pot.id : undefined}
          defaultTo={pot.isSpending ? undefined : pot.id}
          trigger={
            <Button size="sm" variant="outline">
              <ArrowLeftRightIcon /> Move
            </Button>
          }
        />
        <div className="ml-auto flex gap-1">
          <PotDialog
            childId={child.id}
            pot={pot}
            trigger={
              <Button size="icon-sm" variant="ghost" aria-label={`Edit ${pot.name}`} title="Edit">
                <PencilIcon />
              </Button>
            }
          />
          {!pot.isSpending ? (
            <Confirm
              title={`Close “${pot.name}”?`}
              description={
                pot.balanceCents > 0
                  ? `${money(pot.balanceCents)} will move to ${child.name}’s General pot. Any allowance paid into this pot will go to General instead.`
                  : 'The pot will be removed from both the dashboard and the kids app.'
              }
              confirmLabel="Close pot"
              onConfirm={() => archive.mutate(undefined)}
              trigger={
                <Button size="icon-sm" variant="ghost" aria-label={`Close ${pot.name}`} title="Close pot">
                  <ArchiveIcon />
                </Button>
              }
            />
          ) : null}
        </div>
      </CardFooter>
    </Card>
  )
}

export function PotsTab({ child }: { child: ChildDetail }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          The General pot funds {child.name}’s Purchase Card. Savings pots are for goals.
        </p>
        <PotDialog
          childId={child.id}
          trigger={
            <Button>
              <PlusIcon /> New pot
            </Button>
          }
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {child.pots.map((p) => (
          <PotCard key={p.id} child={child} pot={p} />
        ))}
      </div>
    </div>
  )
}
