import "@testing-library/jest-dom/vitest"

// React's act() environment flag for isolated roots created by the SDK.
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
