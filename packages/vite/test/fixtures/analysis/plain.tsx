import { useState } from "react"

export function Plain() {
  const [count] = useState(0)
  return <span>{count}</span>
}
