import { siteConfig } from "@/lib/site"

export function SiteFooter() {
  return (
    <footer className="group-has-[.docs-nav]/body:pb-20 group-has-[[data-slot=docs]]/body:hidden group-has-[.docs-nav]/body:sm:pb-0">
      <div className="container-wrapper px-4 xl:px-6">
        <div className="flex h-(--footer-height) items-center justify-between">
          <div className="text-muted-foreground w-full px-1 text-center text-xs leading-loose sm:text-sm">
            {siteConfig.name}: independently deployed React micro-frontends on TanStack Router,
            Vite and Tecton UI. Packages:{" "}
            <span className="font-mono">{siteConfig.packages.join(", ")}</span>.
          </div>
        </div>
      </div>
    </footer>
  )
}
