import { SearchIcon, XIcon } from "lucide-react"

import { Button } from "@tecton/react/components/button"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@tecton/react/components/input-group"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@tecton/react/components/select"
import { Chip, ChipGroup, ChipList } from "@tecton/react/tecton/chip"
import {
  FIELDS,
  TEST_IDS,
  WELL_STATUS_META,
  WELL_TYPE_META,
  type WellStatus,
  type WellType,
} from "@platform-internal/conformance"

import { isFiltered, type WellFilter } from "@/lib/data"

const ids = TEST_IDS.wellPlanner
const STATUSES = Object.keys(WELL_STATUS_META) as WellStatus[]
const TYPES = Object.keys(WELL_TYPE_META) as WellType[]

export interface WellsFilterBarProps {
  value: WellFilter
  onChange: (next: WellFilter) => void
  resultCount: number
}

/** Search, two selects and status chips over the well inventory. */
export function WellsFilterBar({ value, onChange, resultCount }: WellsFilterBarProps) {
  const set = <TKey extends keyof WellFilter>(key: TKey, next: WellFilter[TKey]) =>
    onChange({ ...value, [key]: next })

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-3 md:flex-row md:items-center">
        <InputGroup aria-label="Search wells" className="md:max-w-xs">
          <InputGroupInput
            data-testid={ids.wellSearch}
            placeholder="Search by name, rig or operator…"
            value={value.query}
            onChange={(event) => set("query", event.target.value)}
          />
          <InputGroupAddon align="inline-start">
            <SearchIcon aria-hidden />
          </InputGroupAddon>
        </InputGroup>
        <Select
          aria-label="Field"
          className="md:w-48"
          selectedKey={value.field}
          onSelectionChange={(key) => set("field", String(key))}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem id="all">All fields</SelectItem>
            {FIELDS.map((field) => (
              <SelectItem key={field} id={field}>
                {field}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          aria-label="Well type"
          className="md:w-44"
          selectedKey={value.type}
          onSelectionChange={(key) => set("type", String(key) as WellType | "all")}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem id="all">All types</SelectItem>
            {TYPES.map((type) => (
              <SelectItem key={type} id={type}>
                {WELL_TYPE_META[type]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p
          data-testid={ids.wellCount}
          className="text-muted-foreground ml-auto font-mono text-xs"
        >
          {resultCount} {resultCount === 1 ? "well" : "wells"}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-muted-foreground text-xs">Status</span>
        <ChipGroup
          aria-label="Filter by status"
          selectionMode="multiple"
          selectedKeys={value.statuses}
          onSelectionChange={(keys) =>
            set("statuses", Array.from(keys as Set<string>) as WellStatus[])
          }
        >
          <ChipList>
            {STATUSES.map((status) => (
              <Chip key={status} id={status}>
                {WELL_STATUS_META[status].label}
              </Chip>
            ))}
          </ChipList>
        </ChipGroup>
        {isFiltered(value) ? (
          <Button
            variant="ghost"
            size="sm"
            onPress={() => onChange({ query: "", field: "all", type: "all", statuses: [] })}
          >
            <XIcon aria-hidden /> Clear
          </Button>
        ) : null}
      </div>
    </div>
  )
}
