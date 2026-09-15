/**
 * Build-time constant injected by `@platform/vite` (`define`). Undefined when
 * the SDK runs outside a platform build (tests, plain Vite), in which case
 * `createMfe({ mfeId })` must be given explicitly.
 */
declare const __PLATFORM_MFE_ID__: string | undefined
