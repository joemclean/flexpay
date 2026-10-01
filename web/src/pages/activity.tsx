import { useInfiniteQuery } from '@tanstack/react-query'
import { ReceiptTextIcon, SearchIcon, XIcon } from 'lucide-react'
import { useEffect, useState } from 'react'
import { EmptyState, ErrorState, ListSkeleton, PageHeader } from '@/components/common'
import { TransactionsTable } from '@/components/transactions'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Field, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Spinner } from '@/components/ui/spinner'
import { get } from '@/lib/api'
import { CATEGORY_LABELS, KIND_LABELS } from '@/lib/format'
import { useChildren } from '@/lib/queries'
import { CATEGORIES, type Transaction, type TransactionKind } from '@/lib/types'

interface Filters {
  childId: string
  kind: string
  category: string
  status: string
  q: string
  from: string
  to: string
}

const EMPTY: Filters = { childId: 'all', kind: 'all', category: 'all', status: 'all', q: '', from: '', to: '' }

function useDebounced<T>(value: T, ms = 300): T {
  const [v, setV] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return v
}

export function TransactionsFeed({ childId, compactFilters = false }: { childId?: string; compactFilters?: boolean }) {
  const children = useChildren()
  const [filters, setFilters] = useState<Filters>({ ...EMPTY, childId: childId ?? 'all' })
  const q = useDebounced(filters.q)
  const set = <K extends keyof Filters>(key: K, value: Filters[K]) => setFilters((f) => ({ ...f, [key]: value }))

  const params = new URLSearchParams({ limit: '30' })
  const effectiveChild = childId ?? (filters.childId !== 'all' ? filters.childId : '')
  if (effectiveChild) params.set('childId', effectiveChild)
  if (filters.kind !== 'all') params.set('kind', filters.kind)
  if (filters.category !== 'all') params.set('category', filters.category)
  if (filters.status !== 'all') params.set('status', filters.status)
  if (q.trim()) params.set('q', q.trim())
  if (filters.from) params.set('from', filters.from)
  if (filters.to) params.set('to', filters.to)
  const key = params.toString()

  const feed = useInfiniteQuery({
    queryKey: ['transactions', key],
    queryFn: ({ pageParam }) =>
      get<{ items: Transaction[]; nextCursor: string | null }>(`/transactions?${key}${pageParam ? `&cursor=${pageParam}` : ''}`),
    initialPageParam: '' as string,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    placeholderData: (prev) => prev,
  })

  const items = feed.data?.pages.flatMap((p) => p.items) ?? []
  const dirty = JSON.stringify({ ...filters, childId: childId ?? filters.childId }) !== JSON.stringify({ ...EMPTY, childId: childId ?? 'all' })

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
        <Field className={compactFilters ? 'sm:col-span-2 lg:col-span-2' : 'sm:col-span-2 lg:col-span-2'}>
          <FieldLabel htmlFor="tx-search" className="sr-only">
            Search
          </FieldLabel>
          <InputGroup>
            <InputGroupAddon>
              <SearchIcon />
            </InputGroupAddon>
            <InputGroupInput id="tx-search" placeholder="Search merchant, friend or note" value={filters.q} onChange={(e) => set('q', e.target.value)} />
          </InputGroup>
        </Field>
        {!childId ? (
          <Select value={filters.childId} onValueChange={(v) => set('childId', v)}>
            <SelectTrigger aria-label="Child" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All kids</SelectItem>
              {children.data?.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.avatar} {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null}
        <Select value={filters.kind} onValueChange={(v) => set('kind', v)}>
          <SelectTrigger aria-label="Type" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            {(Object.keys(KIND_LABELS) as TransactionKind[]).map((k) => (
              <SelectItem key={k} value={k}>
                {KIND_LABELS[k]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filters.category} onValueChange={(v) => set('category', v)}>
          <SelectTrigger aria-label="Category" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {CATEGORIES.map((c) => (
              <SelectItem key={c} value={c}>
                {CATEGORY_LABELS[c]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filters.status} onValueChange={(v) => set('status', v)}>
          <SelectTrigger aria-label="Status" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Any status</SelectItem>
            <SelectItem value="posted">Completed</SelectItem>
            <SelectItem value="declined">Declined</SelectItem>
          </SelectContent>
        </Select>
        <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-6">
          <Field className="flex-1 sm:max-w-44">
            <FieldLabel htmlFor="tx-from" className="text-xs text-muted-foreground">
              From
            </FieldLabel>
            <Input id="tx-from" type="date" value={filters.from} max={filters.to || undefined} onChange={(e) => set('from', e.target.value)} />
          </Field>
          <Field className="flex-1 sm:max-w-44">
            <FieldLabel htmlFor="tx-to" className="text-xs text-muted-foreground">
              To
            </FieldLabel>
            <Input id="tx-to" type="date" value={filters.to} min={filters.from || undefined} onChange={(e) => set('to', e.target.value)} />
          </Field>
          {dirty ? (
            <Button variant="ghost" onClick={() => setFilters({ ...EMPTY, childId: childId ?? 'all' })}>
              <XIcon /> Clear
            </Button>
          ) : null}
          {feed.isFetching && !feed.isFetchingNextPage ? <Spinner className="mb-2.5 text-muted-foreground" /> : null}
        </div>
      </div>

      <Card className="py-2">
        <CardContent className="px-4">
          {feed.isError ? (
            <ErrorState error={feed.error} onRetry={() => void feed.refetch()} />
          ) : feed.isPending ? (
            <ListSkeleton rows={8} className="py-3" />
          ) : items.length === 0 ? (
            <EmptyState icon={<ReceiptTextIcon />} title="No transactions found" description="Try changing or clearing the filters." className="my-4" />
          ) : (
            <TransactionsTable items={items} showChild={!childId} />
          )}
        </CardContent>
      </Card>
      {feed.hasNextPage ? (
        <Button variant="outline" className="self-center" onClick={() => void feed.fetchNextPage()} disabled={feed.isFetchingNextPage}>
          {feed.isFetchingNextPage ? <Spinner /> : null} Load more
        </Button>
      ) : items.length > 0 ? (
        <p className="text-center text-xs text-muted-foreground">That’s everything.</p>
      ) : null}
    </div>
  )
}

export function ActivityPage() {
  return (
    <>
      <PageHeader title="Activity" description="Every purchase, allowance, reward and fee across your family." />
      <TransactionsFeed />
    </>
  )
}
