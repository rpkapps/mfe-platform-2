import { defineMfeConfig } from "@platform/vite/config"

/**
 * Manifest-affecting configuration. Everything is optional: the platform infers
 * mfeId (package name → .platform/identity.json), the route prefix (`/<mfeId>`),
 * capabilities (from the SDK APIs you import), shared dependencies (from
 * package.json) and Tecton/Tailwind support (from installed packages).
 * Changing this file requires restarting `platform dev`.
 */
export default defineMfeConfig({
  displayName: "__DISPLAY_NAME__",
  navigation: {
    title: "__DISPLAY_NAME__",
    description: "Track and inspect wells",
    icon: "package",
    keywords: ["wells", "inventory"],
    // category: "Operations", order: 10
  },
  // Runtime environment: public, allow-listed values injected per deployment by the host
  // (PLATFORM_MFE_<ID>_ENV_<KEY>). Never declare secrets; names such as TOKEN or API_KEY
  // are refused. Read them with `useRuntimeEnv()`; typed through `Register` in src/platform.d.ts.
  env: {
    API_BASE_URL: {
      required: false,
      default: "/api",
      description: "Base URL of the wells API",
    },
  },

  // --- Other options (uncomment to override the inferred value) ---------------------------
  // mfeId: "__MFE_ID__",              // persisted in .platform/identity.json; storage, commands and settings depend on it
  // routePrefix: "__ROUTE_PREFIX__",  // shell mount point; route files stay prefix-relative
  // description: "One-line description shown by the App Finder",
  // discoverable: true,               // false hides the MFE from the App Finder (widget libraries)
  // permissionGroups: ["wells:read"], // preflight: users without these groups never load the remote
  // capabilities: { add: [], remove: [] }, // ids: navigation, context, storage.local, storage.session, telemetry,
  //                                        // commands, settings, help, release-notes, breadcrumbs, overlays,
  //                                        // notifications, runtime-env, widgets
  // shared: { "date-fns": { singleton: false, scope: "default" } }, // version groups; react is never a singleton
  // css: { scope: true, ownerAttribute: "data-mfe", foundation: "shell" },
  // tecton: "auto",                   // true | false | "auto" (detect @tecton/react)
  // tailwind is a plugin-only option: platform({ tailwind: false }) in vite.config.ts
  // manifest: { fileName: "platform-manifest.json" },
  // federation: (config) => config,   // last-resort hook on the generated federation config
  // runtime: { react: "^__REACT_MAJOR__.0.0" }, // override the React compatibility metadata
})
