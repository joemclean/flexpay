import { useMutation, useQuery, useQueryClient, type UseQueryOptions } from '@tanstack/react-query'
import { toast } from 'sonner'
import { errorMessage, get } from './api'
import type {
  Achievement,
  Approval,
  AuditEvent,
  Card,
  Challenge,
  ChallengeHistoryItem,
  ChildDetail,
  ChildSummary,
  Contact,
  Execution,
  Family,
  Insights,
  Invite,
  Lesson,
  MoneyRequest,
  Overview,
  Parent,
  Pot,
  Providers,
  Report,
  Schedule,
} from './types'

type Opts<T> = Omit<UseQueryOptions<T>, 'queryKey' | 'queryFn'>

export const useProviders = () =>
  useQuery({ queryKey: ['providers'], queryFn: () => get<Providers>('/auth/providers'), staleTime: 5 * 60_000 })

export const useOverview = (opts?: Opts<Overview>) =>
  useQuery({ queryKey: ['overview'], queryFn: () => get<Overview>('/overview'), ...opts })

export const useChildren = () =>
  useQuery({ queryKey: ['children'], queryFn: () => get<{ items: ChildSummary[] }>('/children'), select: (d) => d.items })

export const useApprovals = () =>
  useQuery({
    queryKey: ['approvals'],
    queryFn: () => get<{ items: Approval[] }>('/approvals'),
    select: (d) => d.items,
    refetchInterval: 30_000,
  })

export const useChild = (id: string) =>
  useQuery({ queryKey: ['child', id], queryFn: () => get<ChildDetail>(`/children/${id}`) })

export const usePots = (childId: string) =>
  useQuery({ queryKey: ['child', childId, 'pots'], queryFn: () => get<{ items: Pot[] }>(`/children/${childId}/pots`), select: (d) => d.items })

export const useCard = (childId: string) =>
  useQuery({ queryKey: ['child', childId, 'card'], queryFn: () => get<Card>(`/children/${childId}/card`) })

export const useChallenges = (childId: string) =>
  useQuery({
    queryKey: ['child', childId, 'challenges'],
    queryFn: () => get<{ items: Challenge[]; history: ChallengeHistoryItem[] }>(`/children/${childId}/challenges`),
  })

export const useContacts = (childId: string) =>
  useQuery({
    queryKey: ['child', childId, 'contacts'],
    queryFn: () => get<{ items: Contact[] }>(`/children/${childId}/contacts`),
    select: (d) => d.items,
  })

export const useMoneyRequests = (childId: string) =>
  useQuery({
    queryKey: ['child', childId, 'money-requests'],
    queryFn: () => get<{ items: MoneyRequest[] }>(`/children/${childId}/money-requests`),
    select: (d) => d.items,
  })

export const useSchedules = (childId: string) =>
  useQuery({
    queryKey: ['child', childId, 'schedules'],
    queryFn: () => get<{ items: Schedule[] }>(`/children/${childId}/schedules`),
    select: (d) => d.items,
  })

export const useSchedule = (id: string | null) =>
  useQuery({ queryKey: ['schedule', id], queryFn: () => get<Schedule>(`/schedules/${id}`), enabled: Boolean(id) })

export const useExecutions = (id: string | null) =>
  useQuery({
    queryKey: ['schedule', id, 'executions'],
    queryFn: () => get<{ items: Execution[] }>(`/schedules/${id}/executions`),
    select: (d) => d.items,
    enabled: Boolean(id),
  })

export const useLessons = (childId: string) =>
  useQuery({
    queryKey: ['child', childId, 'lessons'],
    queryFn: () => get<{ rewardCents: number; items: Lesson[] }>(`/children/${childId}/lessons`),
  })

export const useAchievements = (childId: string) =>
  useQuery({
    queryKey: ['child', childId, 'achievements'],
    queryFn: () => get<{ items: Achievement[] }>(`/children/${childId}/achievements`),
    select: (d) => d.items,
  })

export const useInsights = (days: number, childId?: string) =>
  useQuery({
    queryKey: ['insights', days, childId ?? 'all'],
    queryFn: () => get<Insights>(`/insights?days=${days}${childId ? `&childId=${childId}` : ''}`),
    placeholderData: (prev) => prev,
  })

export const useReports = (status: 'open' | 'resolved' | 'all' = 'all') =>
  useQuery({
    queryKey: ['reports', status],
    queryFn: () => get<{ items: Report[] }>(`/reports?status=${status}`),
    select: (d) => d.items,
  })

export const useFamily = () =>
  useQuery({ queryKey: ['family'], queryFn: () => get<{ family: Family; parents: Parent[]; invites: Invite[] }>('/family') })

export const useAuditEvents = () =>
  useQuery({
    queryKey: ['audit'],
    queryFn: () => get<{ items: AuditEvent[] }>('/audit-events'),
    select: (d) => d.items,
  })

/**
 * Mutation that toasts on success/error and refreshes all cached data —
 * money actions affect balances, insights and activity across many screens.
 */
export function useApiMutation<TVars, TResult>(
  fn: (vars: TVars) => Promise<TResult>,
  opts: { success?: string | ((result: TResult, vars: TVars) => string | null); onSuccess?: (result: TResult, vars: TVars) => void } = {},
) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSuccess: async (result, vars) => {
      const message = typeof opts.success === 'function' ? opts.success(result, vars) : opts.success
      if (message) toast.success(message)
      opts.onSuccess?.(result, vars)
      await queryClient.invalidateQueries()
    },
    onError: (err) => {
      toast.error(errorMessage(err))
    },
  })
}
