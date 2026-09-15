import { Link } from "@tanstack/react-router"
import { EllipsisVerticalIcon } from "lucide-react"

import { Badge } from "@tecton/react/components/badge"
import { Button } from "@tecton/react/components/button"
import { Checkbox } from "@tecton/react/components/checkbox"
import {
  DropdownMenu,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@tecton/react/components/dropdown-menu"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@tecton/react/components/table"
import {
  TEST_IDS,
  WELL_STATUS_META,
  WELL_TYPE_META,
  type Well,
} from "@platform-internal/conformance"

const ids = TEST_IDS.wellPlanner

const dateFormat = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  year: "numeric",
})

export interface WellsTableProps {
  wells: Well[]
  selected: string[]
  onSelectedChange: (next: string[]) => void
}

/** The well inventory: selection, status chips, right-aligned numerics, row actions. */
export function WellsTable({ wells, selected, onSelectedChange }: WellsTableProps) {
  return (
    <div className="bg-card overflow-hidden rounded-md border">
      <Table
        aria-label="Wells"
        data-testid={ids.wellTable}
        selectionMode="multiple"
        selectedKeys={new Set(selected)}
        onSelectionChange={(selection) =>
          onSelectedChange(
            selection === "all" ? wells.map((well) => well.id) : Array.from(selection, String)
          )
        }
      >
        <TableHeader className="bg-muted">
          <TableHead id="select" className="h-11 w-10 px-3 text-xs">
            <Checkbox slot="selection" aria-label="Select all wells" />
          </TableHead>
          <TableHead id="name" isRowHeader className="h-11 px-3 text-xs">
            Well
          </TableHead>
          <TableHead id="field" className="h-11 px-3 text-xs">
            Field
          </TableHead>
          <TableHead id="type" className="h-11 px-3 text-xs">
            Type
          </TableHead>
          <TableHead id="status" className="h-11 px-3 text-xs">
            Status
          </TableHead>
          <TableHead id="td" className="h-11 px-3 text-right text-xs">
            TD (m MD)
          </TableHead>
          <TableHead id="spud" className="h-11 px-3 text-xs">
            Spud
          </TableHead>
          <TableHead id="rig" className="h-11 px-3 text-xs">
            Rig
          </TableHead>
          <TableHead id="actions" className="h-11 w-10 px-3 text-xs">
            <span className="sr-only">Actions</span>
          </TableHead>
        </TableHeader>
        <TableBody
          renderEmptyState={() => (
            <div className="text-muted-foreground py-8 text-center">No wells match.</div>
          )}
        >
          {wells.map((well) => {
            const status = WELL_STATUS_META[well.status]
            return (
              <TableRow key={well.id} id={well.id} className="hover:bg-accent/40">
                <TableCell className="h-11 w-10 px-3">
                  <Checkbox slot="selection" aria-label={`Select ${well.name}`} />
                </TableCell>
                <TableCell className="h-11 px-3">
                  <Link
                    to="/wells/$wellId"
                    params={{ wellId: well.id }}
                    className="font-mono font-medium underline-offset-4 hover:underline"
                  >
                    {well.name}
                  </Link>
                </TableCell>
                <TableCell className="h-11 px-3">{well.field}</TableCell>
                <TableCell className="text-muted-foreground h-11 px-3">
                  {WELL_TYPE_META[well.type]}
                </TableCell>
                <TableCell className="h-11 px-3">
                  <Badge variant={status.tone} appearance="outline">
                    {status.label}
                  </Badge>
                </TableCell>
                <TableCell className="h-11 px-3 text-right font-mono tabular-nums">
                  {well.td.toLocaleString("en-GB")}
                </TableCell>
                <TableCell className="text-muted-foreground h-11 px-3 font-mono">
                  {dateFormat.format(new Date(well.spud))}
                </TableCell>
                <TableCell className="text-muted-foreground h-11 px-3">{well.rig}</TableCell>
                <TableCell className="h-11 w-10 px-3">
                  <DropdownMenuTrigger>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      aria-label={`Actions for ${well.name}`}
                    >
                      <EllipsisVerticalIcon aria-hidden />
                    </Button>
                    <DropdownMenu placement="bottom end">
                      <DropdownMenuItem>Open well</DropdownMenuItem>
                      <DropdownMenuItem>Add to programme</DropdownMenuItem>
                      <DropdownMenuItem>Export logs</DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem variant="destructive">Archive</DropdownMenuItem>
                    </DropdownMenu>
                  </DropdownMenuTrigger>
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}
