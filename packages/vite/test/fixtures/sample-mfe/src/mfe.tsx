// Plain remote definition: the fixture must not depend on @platform/react being built.
import "./styles.css"
import { routeTree } from "./routeTree.gen"

const definition = {
  kind: "platform-remote" as const,
  protocolVersion: "1.0",
  mfeId: "sample-mfe",
  widgets: [],
  hasRoutes: routeTree !== undefined,
  mount() {
    return { dispose() {} }
  },
  mountWidget() {
    return { dispose() {}, setProps() {} }
  },
}

export default definition
