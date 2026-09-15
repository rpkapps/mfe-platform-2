import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react"
import type { RegisteredSettingsGroup, SettingsOption } from "@platform-internal/core"

import { Alert, AlertDescription, AlertTitle } from "@tecton/react/components/alert"
import { Button } from "@tecton/react/components/button"
import { Checkbox } from "@tecton/react/components/checkbox"
import { Field, FieldDescription, FieldError, FieldLabel } from "@tecton/react/components/field"
import { Input } from "@tecton/react/components/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@tecton/react/components/select"
import { Switch } from "@tecton/react/components/switch"
import { Textarea } from "@tecton/react/components/textarea"

import {
  settingsController,
  type SettingsController,
  type SettingsFieldState,
} from "@platform/host"
import { usePlatformHost, useRegistryVersion, useSubscription } from "@platform/host-react"

export interface SettingsHostProps {
  groupFilter?: (group: RegisteredSettingsGroup) => boolean
  /** Selected group qualified key (controlled); defaults to `?group=` in the shell location, then the first group. */
  selectedGroup?: string
  onSelectGroup?: (qualifiedKey: string) => void
  /** Field to highlight (`?field=` from the palette). */
  focusField?: string
  className?: string
  emptyState?: ReactNode
}

/**
 * Framework-managed settings: the shell owns navigation (sidebar of groups),
 * placement and persistence; controls are inferred from the field
 * definitions; MFE-managed groups link to their own page.
 */
export function SettingsHost({
  groupFilter,
  selectedGroup,
  onSelectGroup,
  focusField,
  className,
  emptyState = "No settings registered.",
}: SettingsHostProps) {
  const host = usePlatformHost()
  useRegistryVersion(["settings"])
  const groups = useSubscription(
    (listener) => host.registries.settings.events.on("change", listener),
    () =>
      host.registries.settings
        .list()
        .filter((group) => (groupFilter ? groupFilter(group) : true)),
    (a, b) => a.length === b.length && a.every((g, i) => g === b[i])
  )
  const sorted = useMemo(
    () =>
      [...groups].sort(
        (a, b) =>
          (a.owner.displayName ?? a.owner.mfeId).localeCompare(
            b.owner.displayName ?? b.owner.mfeId
          ) ||
          (a.definition.order ?? 100) - (b.definition.order ?? 100) ||
          (a.definition.title ?? a.definition.key).localeCompare(
            b.definition.title ?? b.definition.key
          )
      ),
    [groups]
  )
  const location = useSubscription(
    (listener) => host.navigation.subscribe(() => listener()),
    () => host.navigation.getLocation().search,
    Object.is
  )
  const fromQuery = useMemo(() => {
    try {
      const params = new URLSearchParams(location)
      return {
        group: params.get("group") ?? undefined,
        field: params.get("field") ?? undefined,
      }
    } catch {
      return { group: undefined, field: undefined }
    }
  }, [location])
  const [internal, setInternal] = useState<string | undefined>(undefined)
  const selectedKey = selectedGroup ?? internal ?? fromQuery.group ?? sorted[0]?.qualifiedKey
  const selected = sorted.find((group) => group.qualifiedKey === selectedKey) ?? sorted[0]
  const select = (key: string) => {
    setInternal(key)
    onSelectGroup?.(key)
  }
  if (sorted.length === 0)
    return (
      <p className={["platform-settings-empty", className].filter(Boolean).join(" ")}>
        {emptyState}
      </p>
    )
  const byOwner = new Map<string, RegisteredSettingsGroup[]>()
  for (const group of sorted)
    byOwner.set(group.owner.mfeId, [...(byOwner.get(group.owner.mfeId) ?? []), group])
  return (
    <div
      className={["platform-settings", className].filter(Boolean).join(" ")}
      data-platform-settings=""
    >
      <nav className="platform-settings-nav" aria-label="Settings groups">
        {Array.from(byOwner.entries()).map(([mfeId, list]) => (
          <div key={mfeId} className="platform-settings-nav-owner">
            <span className="platform-settings-nav-owner-title">
              {list[0]?.owner.displayName ?? host.remotes.get(mfeId)?.displayName ?? mfeId}
            </span>
            <ul>
              {list.map((group) => (
                <li key={group.qualifiedKey}>
                  <button
                    type="button"
                    className="platform-settings-nav-item"
                    aria-current={
                      selected?.qualifiedKey === group.qualifiedKey ? "page" : undefined
                    }
                    onClick={() => select(group.qualifiedKey)}
                    data-platform-settings-group={group.qualifiedKey}
                  >
                    {group.definition.title ?? group.definition.key}
                    {group.definition.managedBy === "mfe" ? (
                      <span className="platform-settings-nav-badge">app</span>
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>
      <section className="platform-settings-content" aria-live="polite">
        {selected ? (
          <SettingsGroupView
            key={selected.qualifiedKey}
            group={selected}
            focusField={focusField ?? fromQuery.field}
          />
        ) : null}
      </section>
    </div>
  )
}

function SettingsGroupView({
  group,
  focusField,
}: {
  group: RegisteredSettingsGroup
  focusField?: string
}) {
  const host = usePlatformHost()
  const title = group.definition.title ?? group.definition.key
  if ((group.definition.managedBy ?? "framework") === "mfe") {
    const prefix = host.routePrefixOf(group.owner.mfeId)
    const href = `${prefix === "/" ? "" : prefix}${group.definition.route ?? ""}`
    return (
      <div className="platform-settings-group" data-platform-settings-managed="mfe">
        <h2 className="platform-settings-group-title">{title}</h2>
        {group.definition.description ? (
          <p className="platform-settings-group-description">{group.definition.description}</p>
        ) : null}
        <p>This settings page is provided by {group.owner.displayName ?? group.owner.mfeId}.</p>
        <Button onPress={() => host.navigation.push(href)}>Open {title}</Button>
      </div>
    )
  }
  return (
    <div className="platform-settings-group" data-platform-settings-managed="framework">
      <h2 className="platform-settings-group-title">{title}</h2>
      {group.definition.description ? (
        <p className="platform-settings-group-description">{group.definition.description}</p>
      ) : null}
      <div className="platform-settings-fields">
        {group.fields.map((meta) => (
          <SettingsFieldView
            key={meta.qualifiedKey}
            group={group}
            fieldKey={meta.key}
            autoFocus={focusField === meta.key}
          />
        ))}
      </div>
    </div>
  )
}

function useController(
  group: RegisteredSettingsGroup,
  fieldKey: string
): {
  controller: SettingsController | null
  state: SettingsFieldState | null
  error: string | null
} {
  const host = usePlatformHost()
  const [error, setError] = useState<string | null>(null)
  const controllerRef = useRef<SettingsController | null>(null)
  if (!controllerRef.current && !error) {
    try {
      controllerRef.current = settingsController(host, group, fieldKey)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    }
  }
  const controller = controllerRef.current
  useEffect(() => {
    if (!controller) return
    if (controller.meta.asyncOptions) void controller.loadOptions()
    return () => {
      controller.dispose()
      controllerRef.current = null
    }
  }, [controller])
  const state = useSyncExternalStore(
    controller ? controller.subscribe : () => () => {},
    controller ? controller.getState : () => null,
    controller ? controller.getState : () => null
  )
  return { controller, state, error }
}

function SettingsFieldView({
  group,
  fieldKey,
  autoFocus,
}: {
  group: RegisteredSettingsGroup
  fieldKey: string
  autoFocus?: boolean
}) {
  const { controller, state, error } = useController(group, fieldKey)
  if (error || !controller || !state) {
    return (
      <Alert variant="destructive" data-platform-setting-error={fieldKey}>
        <AlertTitle>Setting unavailable</AlertTitle>
        <AlertDescription>{error ?? "This setting could not be initialised."}</AlertDescription>
      </Alert>
    )
  }
  if (!state.visible) return null
  const { meta, ids } = state
  const invalid = !state.validation.valid
  const disabled = state.disabled || state.readOnly
  return (
    <Field
      className="platform-settings-field"
      data-platform-setting={meta.qualifiedKey}
      data-invalid={invalid || undefined}
      data-disabled={disabled || undefined}
    >
      <div className="platform-settings-field-header">
        <FieldLabel id={ids.label} htmlFor={ids.input}>
          {meta.label}
        </FieldLabel>
        {!state.isDefault ? (
          <Button
            variant="link"
            size="xs"
            onPress={() => controller.reset()}
            data-platform-setting-reset=""
          >
            Reset to default
          </Button>
        ) : null}
      </div>
      {meta.description ? (
        <FieldDescription id={ids.description}>{meta.description}</FieldDescription>
      ) : null}
      <FieldControl controller={controller} state={state} autoFocus={autoFocus} />
      {state.optionsStatus === "loading" ? (
        <p className="platform-settings-hint" aria-live="polite">
          Loading options…
        </p>
      ) : null}
      {state.optionsStatus === "error" ? (
        <p className="platform-settings-hint platform-settings-hint-error" role="alert">
          Options failed to load: {state.optionsError}{" "}
          <Button variant="link" size="xs" onPress={() => void controller.retryOptions()}>
            Retry
          </Button>
        </p>
      ) : null}
      {state.stale && state.optionsStatus === "ready" ? (
        <p className="platform-settings-hint platform-settings-hint-warning">
          The current value is no longer one of the available options.
        </p>
      ) : null}
      {invalid ? (
        <FieldError id={ids.error}>
          {state.validation.valid
            ? null
            : `${state.validation.message}${state.validation.recovered === "default" ? " — the default value is shown." : state.validation.recovered === "migrated" ? " — migrated." : ""}`}
        </FieldError>
      ) : null}
    </Field>
  )
}

function optionKey(index: number) {
  return `option-${index}`
}

function FieldControl({
  controller,
  state,
  autoFocus,
}: {
  controller: SettingsController
  state: SettingsFieldState
  autoFocus?: boolean
}) {
  const { meta, ids } = state
  const disabled = state.disabled || state.readOnly
  const [draft, setDraft] = useState<string | null>(null)
  const describedBy =
    [meta.description ? ids.description : null, !state.validation.valid ? ids.error : null]
      .filter(Boolean)
      .join(" ") || undefined
  if (meta.customRenderer) return <CustomRenderer controller={controller} state={state} />
  switch (meta.kind) {
    case "boolean":
      return (
        <Switch
          id={ids.input}
          isSelected={Boolean(state.value)}
          onChange={(value) => controller.setValue(value)}
          isDisabled={disabled}
          isReadOnly={state.readOnly}
          aria-describedby={describedBy}
          aria-labelledby={ids.label}
          autoFocus={autoFocus}
        />
      )
    case "number":
      return (
        <Input
          id={ids.input}
          type="number"
          value={
            draft ??
            (state.value === undefined || state.value === null ? "" : String(state.value))
          }
          min={controller.field.min}
          max={controller.field.max}
          step={controller.field.step}
          placeholder={controller.field.placeholder}
          disabled={disabled}
          readOnly={state.readOnly}
          aria-invalid={!state.validation.valid || undefined}
          aria-describedby={describedBy}
          autoFocus={autoFocus}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={() => {
            if (draft === null) return
            const next = draft.trim() === "" ? controller.field.defaultValue : Number(draft)
            controller.setValue(next)
            setDraft(null)
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") (event.target as HTMLInputElement).blur()
          }}
        />
      )
    case "select": {
      const options = (state.options ?? []) as SettingsOption[]
      const selectedIndex = options.findIndex(
        (option) =>
          Object.is(option.value, state.value) ||
          JSON.stringify(option.value) === JSON.stringify(state.value)
      )
      return (
        <Select
          id={ids.input}
          selectedKey={selectedIndex >= 0 ? optionKey(selectedIndex) : null}
          onSelectionChange={(key) => {
            const index = Number(String(key).replace("option-", ""))
            const option = options[index]
            if (option) controller.setValue(option.value)
          }}
          isDisabled={disabled || state.optionsStatus === "loading"}
          aria-describedby={describedBy}
          aria-labelledby={ids.label}
          placeholder={controller.field.placeholder ?? "Select…"}
          className="platform-settings-select"
        >
          <SelectTrigger aria-invalid={!state.validation.valid || undefined}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {options.map((option, index) => (
              <SelectItem
                key={optionKey(index)}
                id={optionKey(index)}
                textValue={option.label}
                isDisabled={option.disabled}
              >
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )
    }
    case "multi-select": {
      const options = (state.options ?? []) as SettingsOption[]
      const current = Array.isArray(state.value) ? (state.value as unknown[]) : []
      const has = (value: unknown) =>
        current.some(
          (item) => Object.is(item, value) || JSON.stringify(item) === JSON.stringify(value)
        )
      return (
        <div
          role="group"
          aria-labelledby={ids.label}
          aria-describedby={describedBy}
          className="platform-settings-checklist"
          id={ids.input}
        >
          {options.map((option, index) => (
            <label key={optionKey(index)} className="platform-settings-checklist-item">
              <Checkbox
                isSelected={has(option.value)}
                isDisabled={disabled || option.disabled}
                onChange={(checked) =>
                  controller.setValue(
                    checked
                      ? [
                          ...current.filter((item) => !Object.is(item, option.value)),
                          option.value,
                        ]
                      : current.filter(
                          (item) =>
                            !(
                              Object.is(item, option.value) ||
                              JSON.stringify(item) === JSON.stringify(option.value)
                            )
                        )
                  )
                }
                aria-label={option.label}
              />
              <span>
                {option.label}
                {option.description ? (
                  <small className="platform-settings-option-description">
                    {" "}
                    {option.description}
                  </small>
                ) : null}
              </span>
            </label>
          ))}
          {options.length === 0 && state.optionsStatus === "ready" ? (
            <span className="platform-settings-hint">No options available.</span>
          ) : null}
        </div>
      )
    }
    case "text":
      return (
        <Input
          id={ids.input}
          type="text"
          value={draft ?? String(state.value ?? "")}
          placeholder={controller.field.placeholder}
          disabled={disabled}
          readOnly={state.readOnly}
          aria-invalid={!state.validation.valid || undefined}
          aria-describedby={describedBy}
          autoFocus={autoFocus}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={() => {
            if (draft === null) return
            controller.setValue(draft)
            setDraft(null)
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") (event.target as HTMLInputElement).blur()
          }}
        />
      )
    default:
      return (
        <Textarea
          id={ids.input}
          value={draft ?? safeJson(state.value)}
          disabled={disabled}
          readOnly={state.readOnly}
          aria-invalid={!state.validation.valid || undefined}
          aria-describedby={describedBy}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={() => {
            if (draft === null) return
            try {
              controller.setValue(JSON.parse(draft))
            } catch {
              controller.setValue(draft)
            }
            setDraft(null)
          }}
        />
      )
  }
}

function safeJson(value: unknown): string {
  try {
    return typeof value === "string" ? value : JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

interface RendererHandle {
  update?(controller: unknown): void
  dispose(): void
}

/** Custom renderer surface: `renderer.mount(container, controller)` → `{ update(controller), dispose }`. */
function CustomRenderer({
  controller,
  state,
}: {
  controller: SettingsController
  state: SettingsFieldState
}) {
  const host = usePlatformHost()
  const ref = useRef<HTMLDivElement>(null)
  const handle = useRef<RendererHandle | null>(null)
  const [failure, setFailure] = useState<string | null>(null)
  const renderer = controller.field.renderer as
    { mount?: (container: HTMLElement, controller: unknown) => RendererHandle } | undefined
  useEffect(() => {
    const element = ref.current
    if (!element || typeof renderer?.mount !== "function") {
      setFailure("The custom renderer does not expose a mount() function.")
      return
    }
    try {
      handle.current = renderer.mount(element, controller.controller())
    } catch (error) {
      setFailure(error instanceof Error ? error.message : String(error))
      host.diagnostics.emit({
        type: "log",
        level: "warn",
        message: `custom renderer of ${controller.qualifiedKey} failed to mount`,
        detail: String(error),
      })
    }
    return () => {
      try {
        handle.current?.dispose()
      } catch {
        // isolated
      }
      handle.current = null
      element.replaceChildren()
    }
  }, [renderer, controller, host])
  useEffect(() => {
    try {
      handle.current?.update?.(controller.controller())
    } catch (error) {
      setFailure(error instanceof Error ? error.message : String(error))
    }
  }, [state, controller])
  return (
    <div className="platform-settings-custom" data-platform-setting-renderer="">
      <div ref={ref} data-mfe={controller.meta.qualifiedKey.split(":")[0]} />
      {failure ? (
        <Alert variant="destructive">
          <AlertTitle>Renderer failed</AlertTitle>
          <AlertDescription>{failure}</AlertDescription>
        </Alert>
      ) : null}
    </div>
  )
}
