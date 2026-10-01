import { ArrowLeftRightIcon, PlusIcon, SmartphoneIcon } from 'lucide-react'
import { Navigate, useNavigate, useParams } from 'react-router'
import { EmojiAvatar, ErrorState, PageHeader } from '@/components/common'
import { PairingDialog } from '@/components/dialogs/card-device-dialogs'
import { DepositDialog, TransferDialog } from '@/components/dialogs/pot-dialogs'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ApiError } from '@/lib/api'
import { money } from '@/lib/format'
import { useChild } from '@/lib/queries'
import { TransactionsFeed } from '../activity'
import { AllowanceTab } from './allowance-tab'
import { CardTab } from './card-tab'
import { ChoresTab } from './chores-tab'
import { FriendsTab } from './friends-tab'
import { LessonsTab } from './lessons-tab'
import { ChildOverviewTab } from './overview-tab'
import { PotsTab } from './pots-tab'
import { ChildSettingsTab } from './settings-tab'

const TABS = [
  { value: 'overview', label: 'Overview' },
  { value: 'pots', label: 'Pots' },
  { value: 'chores', label: 'Chores' },
  { value: 'allowance', label: 'Allowance' },
  { value: 'card', label: 'Card' },
  { value: 'activity', label: 'Activity' },
  { value: 'friends', label: 'Friends' },
  { value: 'lessons', label: 'Lessons' },
  { value: 'settings', label: 'Settings' },
] as const

export function ChildPage() {
  const { childId = '', tab = 'overview' } = useParams()
  const navigate = useNavigate()
  const child = useChild(childId)

  if (!TABS.some((t) => t.value === tab)) return <Navigate to={`/children/${childId}`} replace />
  if (child.isError) {
    if (child.error instanceof ApiError && child.error.status === 404) return <Navigate to="/" replace />
    return <ErrorState error={child.error} onRetry={() => void child.refetch()} />
  }

  const c = child.data
  return (
    <>
      {c ? (
        <PageHeader
          leading={<EmojiAvatar emoji={c.avatar} className="size-14 text-3xl" />}
          title={c.name}
          description={
            <>
              <span className="tabular font-medium text-foreground">{money(c.totalCents)}</span> total ·{' '}
              {money(c.spendingCents)} to spend · {money(c.savedCents)} saved
              {c.age ? ` · ${c.age} years old` : ''}
            </>
          }
          actions={
            <>
              <DepositDialog
                childId={c.id}
                childName={c.name}
                pots={c.pots}
                trigger={
                  <Button>
                    <PlusIcon /> Add money
                  </Button>
                }
              />
              <TransferDialog
                childId={c.id}
                pots={c.pots}
                trigger={
                  <Button variant="outline">
                    <ArrowLeftRightIcon /> Move money
                  </Button>
                }
              />
              <PairingDialog
                childId={c.id}
                childName={c.name}
                trigger={
                  <Button variant="outline">
                    <SmartphoneIcon /> Connect device
                  </Button>
                }
              />
            </>
          }
        />
      ) : (
        <div className="flex items-center gap-3">
          <Skeleton className="size-14 rounded-full" />
          <div className="flex flex-col gap-2">
            <Skeleton className="h-6 w-40" />
            <Skeleton className="h-4 w-64" />
          </div>
        </div>
      )}

      <Tabs value={tab} onValueChange={(v) => navigate(v === 'overview' ? `/children/${childId}` : `/children/${childId}/${v}`)} className="gap-6">
        <div className="-mx-4 overflow-x-auto px-4 pb-1 md:mx-0 md:px-0">
          <TabsList variant="line" className="w-max gap-1">
            {TABS.map((t) => (
              <TabsTrigger key={t.value} value={t.value} className="px-2.5">
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
        {c ? (
          <>
            <TabsContent value="overview">
              <ChildOverviewTab child={c} />
            </TabsContent>
            <TabsContent value="pots">
              <PotsTab child={c} />
            </TabsContent>
            <TabsContent value="chores">
              <ChoresTab child={c} />
            </TabsContent>
            <TabsContent value="allowance">
              <AllowanceTab child={c} />
            </TabsContent>
            <TabsContent value="card">
              <CardTab child={c} />
            </TabsContent>
            <TabsContent value="activity">
              <TransactionsFeed childId={c.id} compactFilters />
            </TabsContent>
            <TabsContent value="friends">
              <FriendsTab child={c} />
            </TabsContent>
            <TabsContent value="lessons">
              <LessonsTab child={c} />
            </TabsContent>
            <TabsContent value="settings">
              <ChildSettingsTab child={c} />
            </TabsContent>
          </>
        ) : (
          <Skeleton className="h-80 rounded-xl" />
        )}
      </Tabs>
    </>
  )
}
