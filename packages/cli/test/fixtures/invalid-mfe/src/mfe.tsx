import { createMfe, createWidget, useNotifications } from "@platform/react"
import { loadRemote } from "@module-federation/runtime"

import { entry } from "../.platform/entry"

function Card() {
  return <p>card</p>
}

const id = "invalid-mfe"
const definition = createMfe({
  mfeId: "other-mfe",
  widgets: { AssetCard: createWidget({ component: Card }) },
})
createMfe({ mfeId: id })

export function Notifier() {
  const { notify } = useNotifications()
  notify({ title: <strong>hi</strong> })
  void loadRemote("x")
  return null
}

export default definition
export { entry }
