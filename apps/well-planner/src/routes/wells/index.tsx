import { useState } from "react"
import { createFileRoute, Link } from "@tanstack/react-router"
import { DownloadIcon, PlusIcon, UploadIcon } from "lucide-react"

import { Button } from "@tecton/react/components/button"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@tecton/react/components/empty"
import {
  PageHeader,
  PageHeaderActions,
  PageHeaderContent,
  PageHeaderDescription,
  PageHeaderEyebrow,
  PageHeaderTitle,
} from "@tecton/react/tecton/page-header"
import { TEST_IDS } from "@platform-internal/conformance"

import { WellsFilterBar } from "@/components/wells-filter-bar"
import { WellsTable } from "@/components/wells-table"
import { emptyFilter, filterWells, isFiltered, listWells, type WellFilter } from "@/lib/data"

const ids = TEST_IDS.wellPlanner

export const Route = createFileRoute("/wells/")({
  staticData: {
    navigation: {
      title: "Wells",
      description: "Every well across the licence",
      keywords: ["wells", "inventory", "drilling"],
      order: 1,
    },
  },
  loader: async () => listWells(),
  component: WellsList,
})

function WellsList() {
  const wells = Route.useLoaderData()
  const [filter, setFilter] = useState<WellFilter>(emptyFilter)
  const [selected, setSelected] = useState<string[]>([])
  const visible = filterWells(wells, filter)

  return (
    <div className="flex flex-col gap-6">
      <PageHeader>
        <PageHeaderContent>
          <PageHeaderEyebrow>Inventory</PageHeaderEyebrow>
          <PageHeaderTitle>Wells</PageHeaderTitle>
          <PageHeaderDescription>
            All wells across the licence. Select rows to add them to a programme or export their
            logs.
          </PageHeaderDescription>
        </PageHeaderContent>
        <PageHeaderActions>
          <Button variant="ghost" size="sm">
            <DownloadIcon aria-hidden /> Export
          </Button>
          <Button variant="outline" size="sm">
            <UploadIcon aria-hidden /> Import
          </Button>
          <Button size="sm">
            <PlusIcon aria-hidden /> New well
          </Button>
        </PageHeaderActions>
      </PageHeader>

      <WellsFilterBar value={filter} onChange={setFilter} resultCount={visible.length} />

      {visible.length === 0 ? (
        <Empty data-testid={ids.wellEmpty}>
          <EmptyHeader>
            <EmptyTitle>No wells match</EmptyTitle>
            <EmptyDescription>
              {isFiltered(filter)
                ? "Nothing matches the current filter. Clear it to see the whole inventory."
                : "The licence has no wells yet."}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <WellsTable wells={visible} selected={selected} onSelectedChange={setSelected} />
      )}

      {/* A well the viewer may not open: the permission-guard fixture. */}
      <Link
        to="/wells/$wellId"
        params={{ wellId: "restricted" }}
        className="text-muted-foreground text-xs underline underline-offset-4"
      >
        Restricted well (admins only)
      </Link>
    </div>
  )
}
