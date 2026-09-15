export const siteConfig = {
  name: "MFE Platform",
  description:
    "Independently deployed React micro-frontends and widgets with TanStack Router folder routing, Vite builds, platform-managed Module Federation, isolated React roots and Tecton UI.",
  packages: ["@platform/react", "@platform/vite", "@platform/cli", "@platform/host"],
  createCommand: "pnpm dlx @platform/cli create my-mfe",
  /** Public origin used in diagnostics (`docsUrl`) and in llms.txt. */
  origin: "https://platform.docs.local",
  nav: [
    { title: "Docs", href: "/docs" },
    { title: "Guides", href: "/docs/guides" },
    { title: "Reference", href: "/docs/reference" },
    { title: "Recipes", href: "/docs/recipes" },
  ],
}

/** Which top-level navigation entry a docs pathname belongs to. */
export function activeNavHref(pathname: string): string | null {
  if (pathname === "/docs/guides") return "/docs/guides"
  if (pathname === "/docs/reference" || pathname.startsWith("/docs/reference/"))
    return "/docs/reference"
  if (pathname === "/docs/examples") return "/docs/reference"
  if (pathname === "/docs/recipes" || pathname.startsWith("/docs/recipes/"))
    return "/docs/recipes"
  if (pathname === "/docs" || pathname.startsWith("/docs/getting-started")) return "/docs"
  if (pathname.startsWith("/docs/")) return "/docs/guides"
  return null
}
