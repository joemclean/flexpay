import {
  BellIcon,
  ChartPieIcon,
  ChevronsUpDownIcon,
  LayoutDashboardIcon,
  LogOutIcon,
  MonitorIcon,
  MoonIcon,
  PlusIcon,
  ReceiptTextIcon,
  SettingsIcon,
  SunIcon,
} from 'lucide-react'
import { useTheme } from '@/lib/theme'
import { Suspense } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router'
import { Spinner } from '@/components/ui/spinner'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSkeleton,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
  useSidebar,
} from '@/components/ui/sidebar'
import { useAuth } from '@/lib/auth'
import { initials, money } from '@/lib/format'
import { useApprovals, useChildren } from '@/lib/queries'
import { ApprovalsList } from './approvals'
import { Wordmark } from './brand'
import { AddChildDialog } from './dialogs/add-child-dialog'

const NAV = [
  { to: '/', label: 'Overview', icon: LayoutDashboardIcon, end: true },
  { to: '/activity', label: 'Activity', icon: ReceiptTextIcon },
  { to: '/insights', label: 'Insights', icon: ChartPieIcon },
]

function NavItem({ to, label, icon: Icon, end, badge }: { to: string; label: string; icon: typeof LayoutDashboardIcon; end?: boolean; badge?: number }) {
  const { setOpenMobile } = useSidebar()
  const location = useLocation()
  const active = end ? location.pathname === to : location.pathname.startsWith(to)
  return (
    <SidebarMenuItem>
      <SidebarMenuButton asChild isActive={active} tooltip={label}>
        <NavLink to={to} end={end} onClick={() => setOpenMobile(false)}>
          <Icon />
          <span>{label}</span>
        </NavLink>
      </SidebarMenuButton>
      {badge ? <SidebarMenuBadge className="bg-primary text-primary-foreground">{badge}</SidebarMenuBadge> : null}
    </SidebarMenuItem>
  )
}

function KidsGroup() {
  const children = useChildren()
  const { setOpenMobile } = useSidebar()
  const location = useLocation()
  return (
    <SidebarGroup>
      <SidebarGroupLabel>Kids</SidebarGroupLabel>
      <AddChildDialog
        trigger={
          <SidebarGroupAction title="Add a child" aria-label="Add a child">
            <PlusIcon />
          </SidebarGroupAction>
        }
      />
      <SidebarGroupContent>
        <SidebarMenu>
          {children.isPending
            ? Array.from({ length: 2 }, (_, i) => (
                <SidebarMenuItem key={i}>
                  <SidebarMenuSkeleton showIcon />
                </SidebarMenuItem>
              ))
            : children.data?.map((c) => {
                const to = `/children/${c.id}`
                return (
                  <SidebarMenuItem key={c.id}>
                    <SidebarMenuButton asChild isActive={location.pathname.startsWith(to)} tooltip={c.name} size="lg">
                      <Link to={to} onClick={() => setOpenMobile(false)}>
                        <span aria-hidden className="flex size-8 shrink-0 items-center justify-center rounded-full bg-brand-soft text-base">
                          {c.avatar}
                        </span>
                        <span className="flex min-w-0 flex-col">
                          <span className="truncate font-medium">{c.name}</span>
                          <span className="tabular truncate text-xs text-muted-foreground">{money(c.totalCents)}</span>
                        </span>
                      </Link>
                    </SidebarMenuButton>
                    {c.pendingApprovals > 0 ? (
                      <SidebarMenuBadge className="top-3 bg-primary text-primary-foreground" aria-label={`${c.pendingApprovals} waiting for approval`}>
                        {c.pendingApprovals}
                      </SidebarMenuBadge>
                    ) : null}
                  </SidebarMenuItem>
                )
              })}
          {children.data?.length === 0 ? (
            <SidebarMenuItem>
              <AddChildDialog
                trigger={
                  <SidebarMenuButton className="text-muted-foreground">
                    <PlusIcon />
                    <span>Add your first child</span>
                  </SidebarMenuButton>
                }
              />
            </SidebarMenuItem>
          ) : null}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  )
}

function UserMenu() {
  const { parent, family, signOut } = useAuth()
  const { theme, setTheme } = useTheme()
  const { isMobile } = useSidebar()
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <SidebarMenuButton size="lg" className="data-[state=open]:bg-sidebar-accent">
          <Avatar className="size-8 rounded-lg">
            <AvatarFallback className="rounded-lg bg-primary text-xs font-semibold text-primary-foreground">
              {initials(parent?.name ?? '?')}
            </AvatarFallback>
          </Avatar>
          <span className="grid flex-1 text-left text-sm leading-tight">
            <span className="truncate font-medium">{parent?.name}</span>
            <span className="truncate text-xs text-muted-foreground">{family?.name}</span>
          </span>
          <ChevronsUpDownIcon className="ml-auto size-4" />
        </SidebarMenuButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent side={isMobile ? 'bottom' : 'right'} align="end" className="min-w-56">
        <DropdownMenuLabel className="font-normal">
          <p className="font-medium">{parent?.name}</p>
          <p className="truncate text-xs text-muted-foreground">{parent?.email}</p>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link to="/settings">
            <SettingsIcon /> Settings
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <SunIcon /> Appearance
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuRadioGroup value={theme} onValueChange={setTheme}>
              <DropdownMenuRadioItem value="light">
                <SunIcon /> Light
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="dark">
                <MoonIcon /> Dark
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="system">
                <MonitorIcon /> System
              </DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => void signOut()}>
          <LogOutIcon /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function AppSidebar() {
  const approvals = useApprovals()
  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="px-3 pt-4 pb-2 group-data-[collapsible=icon]:px-2">
        <Link to="/" className="rounded-md focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none" aria-label="FlexFund Family home">
          <Wordmark sub="Family" className="group-data-[collapsible=icon]:[&>span:last-child]:hidden" />
        </Link>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Family</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {NAV.map((n) => (
                <NavItem key={n.to} {...n} badge={n.to === '/' ? approvals.data?.length : undefined} />
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <KidsGroup />
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <NavItem to="/settings" label="Settings" icon={SettingsIcon} />
          <SidebarMenuItem>
            <UserMenu />
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}

function ApprovalsBell() {
  const approvals = useApprovals()
  const count = approvals.data?.length ?? 0
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label={count ? `${count} items need your approval` : 'Approvals'}>
          <BellIcon />
          {count > 0 ? (
            <Badge className="absolute -top-1 -right-1 h-4.5 min-w-4.5 rounded-full px-1 text-[0.65rem] leading-none">{count}</Badge>
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(26rem,calc(100vw-2rem))] p-0">
        <div className="flex items-center justify-between px-4 py-3">
          <p className="text-sm font-semibold">Needs your approval</p>
          {count > 0 ? <Badge variant="secondary">{count}</Badge> : null}
        </div>
        <Separator />
        <ScrollArea className="max-h-[60vh]">
          <div className="p-3">
            <ApprovalsList items={approvals.data ?? []} compact />
          </div>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  )
}

export function AppShell() {
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-2 border-b bg-background/85 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/70">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mx-1 h-4 data-[orientation=vertical]:h-4" />
          <span className="font-brand text-base font-semibold md:hidden">FlexFund</span>
          <div className="ml-auto flex items-center gap-1">
            <ApprovalsBell />
          </div>
        </header>
        <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 p-4 md:p-8">
          <Suspense
            fallback={
              <div className="flex flex-1 items-center justify-center py-24" role="status" aria-label="Loading">
                <Spinner className="size-6 text-primary" />
              </div>
            }
          >
            <Outlet />
          </Suspense>
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}
