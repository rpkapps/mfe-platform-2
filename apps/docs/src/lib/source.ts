import { loader } from "fumadocs-core/source"

import { docs } from "./docs"

// Server-only: import inside createServerFn handlers only, so the page-tree
// loader never ships to the browser.
export const source = loader({
  baseUrl: "/docs",
  source: docs.toFumadocsSource(),
})
