import { useTheme } from "next-themes"
import {
  BugIcon,
  CircleHelpIcon,
  KeyboardIcon,
  LogOutIcon,
  MoonIcon,
  SettingsIcon,
  SparklesIcon,
  SunIcon,
  UserIcon,
} from "lucide-react"
import { useNavigate, useRouterState } from "@tanstack/react-router"

import {
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@tecton/react/components/dropdown-menu"
import { AppShellHeader, AppShellNav } from "@tecton/react/tecton/app-shell"
import { Link as TectonLink } from "@tecton/react/tecton/link"
import {
  ShellAction,
  ShellActions,
  ShellCommandTrigger,
  ShellDivider,
  ShellOverflow,
  ShellUserMenu,
} from "@tecton/react/tecton/shell-actions"
import { PROJECTS, TEST_IDS, USERS } from "@platform-internal/conformance"

import { AppFinder } from "./app-finder"
import { Breadcrumbs } from "./breadcrumbs"
import type { UserKey } from "@/lib/platform"

const ids = TEST_IDS.shell

const NAV = [
  { to: "/", title: "Home", exact: true },
  { to: "/dashboard", title: "Dashboard" },
  { to: "/settings", title: "Settings" },
  { to: "/help", title: "Help" },
  { to: "/release-notes", title: "Release notes" },
  { to: "/failures", title: "Failure lab" },
] as const

const USER_KEYS: UserKey[] = ["admin", "viewer", "restricted"]

function initialsOf(name: string): string {
  const words = name.split(/\s+/).filter(Boolean)
  return (words.length >= 2 ? `${words[0]![0]}${words[1]![0]}` : name.slice(0, 2)).toUpperCase()
}

export interface ShellHeaderProps {
  userKey: UserKey
  onUserChange: (key: UserKey) => void
  projectIndex: number
  onProjectChange: (index: number) => void
  onOpenPalette: () => void
  onOpenShortcuts: () => void
  onToggleDevtools?: () => void
  /** Rendered once the host exists; the header still renders before then. */
  hasHost: boolean
}

/**
 * The host's top bar: app finder, application context, the command trigger and
 * the global action cluster. Everything below it belongs to the mounted
 * application. Built from `@tecton/react/tecton/{app-shell,shell-actions}` so
 * a shell that copies this file gets the responsive behaviour for free — the
 * command trigger shrinks to an icon below `md` and the secondary actions fold
 * into the overflow menu below `lg`.
 */
export function ShellHeader({
  userKey,
  onUserChange,
  projectIndex,
  onProjectChange,
  onOpenPalette,
  onOpenShortcuts,
  onToggleDevtools,
  hasHost,
}: ShellHeaderProps) {
  const { resolvedTheme, setTheme } = useTheme()
  const navigate = useNavigate()
  const pathname = useRouterState({ select: (state) => state.location.pathname })
  const user = USERS[userKey]
  const project = PROJECTS[projectIndex] ?? PROJECTS[0]
  const isDark = resolvedTheme !== "light"

  return (
    <AppShellHeader>
      <span data-testid={ids.appFinder}>
        {hasHost ? <AppFinder shellName="Conformance Shell" /> : null}
      </span>
      <ShellDivider className="hidden md:block" />
      <div data-testid={ids.breadcrumbs} className="hidden min-w-0 md:block">
        {hasHost ? <Breadcrumbs /> : null}
      </div>
      <AppShellNav className="hidden min-w-0 lg:flex">
        {NAV.map((item) => {
          const active =
            "exact" in item && item.exact ? pathname === item.to : pathname.startsWith(item.to)
          return (
            <TectonLink
              key={item.to}
              href={item.to}
              variant={active ? "default" : "muted"}
              data-active={active || undefined}
              className="hover:bg-muted rounded-md px-2 py-1 text-sm"
            >
              {item.title}
            </TectonLink>
          )
        })}
      </AppShellNav>
      <ShellActions>
        <ShellCommandTrigger data-testid={ids.paletteTrigger} onPress={onOpenPalette}>
          Search or jump to…
        </ShellCommandTrigger>
        <ShellAction
          label="Help"
          className="hidden lg:inline-flex"
          onPress={() => void navigate({ to: "/help" })}
        >
          <CircleHelpIcon aria-hidden />
        </ShellAction>
        <ShellAction
          label="What's new"
          className="hidden lg:inline-flex"
          onPress={() => void navigate({ to: "/release-notes" })}
        >
          <SparklesIcon aria-hidden />
        </ShellAction>
        {onToggleDevtools ? (
          <ShellAction
            label="Developer tools"
            className="hidden lg:inline-flex"
            onPress={onToggleDevtools}
          >
            <BugIcon aria-hidden />
          </ShellAction>
        ) : null}
        <ShellAction label="Keyboard shortcuts" shortcut="?" onPress={onOpenShortcuts}>
          <KeyboardIcon aria-hidden />
        </ShellAction>
        <ShellAction
          label="Settings"
          className="hidden lg:inline-flex"
          onPress={() => void navigate({ to: "/settings" })}
        >
          <SettingsIcon aria-hidden />
        </ShellAction>
        <ShellOverflow className="lg:hidden">
          <DropdownMenuGroup>
            {NAV.map((item) => (
              <DropdownMenuItem key={item.to} href={item.to}>
                {item.title}
              </DropdownMenuItem>
            ))}
          </DropdownMenuGroup>
          {onToggleDevtools ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onAction={onToggleDevtools}>
                <BugIcon aria-hidden /> Developer tools
              </DropdownMenuItem>
            </>
          ) : null}
        </ShellOverflow>
        <ShellUserMenu
          user={{ name: user.displayName, initials: initialsOf(user.displayName) }}
        >
          <DropdownMenuLabel>
            <span data-testid={ids.userName}>{user.displayName}</span>
            <span className="text-muted-foreground block text-xs font-normal">
              {user.email}
            </span>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuGroup aria-label="Switch user" data-testid={ids.userSwitch}>
            {USER_KEYS.map((key) => (
              <DropdownMenuItem
                key={key}
                onAction={() => onUserChange(key)}
                data-current={key === userKey || undefined}
              >
                <UserIcon aria-hidden /> {USERS[key].displayName}
                {key === userKey ? <span className="ml-auto text-xs">current</span> : null}
              </DropdownMenuItem>
            ))}
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuLabel className="text-xs font-normal">Licence</DropdownMenuLabel>
          <DropdownMenuGroup aria-label="Switch licence" data-testid={ids.projectSwitch}>
            {PROJECTS.map((entry, index) => (
              <DropdownMenuItem
                key={entry.id}
                onAction={() => onProjectChange(index)}
                data-current={index === projectIndex || undefined}
              >
                {entry.name}
                {index === projectIndex ? (
                  <span className="ml-auto text-xs">current</span>
                ) : null}
              </DropdownMenuItem>
            ))}
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            data-testid={ids.themeToggle}
            onAction={() => setTheme(isDark ? "light" : "dark")}
          >
            {isDark ? <SunIcon aria-hidden /> : <MoonIcon aria-hidden />}
            {isDark ? "Light theme" : "Dark theme"}
          </DropdownMenuItem>
          <DropdownMenuItem>
            <LogOutIcon aria-hidden /> Sign out
          </DropdownMenuItem>
        </ShellUserMenu>
      </ShellActions>
      <span className="sr-only" data-testid={ids.projectSwitch + "-value"}>
        {project?.name}
      </span>
    </AppShellHeader>
  )
}
