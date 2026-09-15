import { cn } from "cn"

export function PlatformLogo({ className }: { className?: string }) {
  return (
    <img
      src="/favicon.svg"
      alt=""
      aria-hidden
      draggable={false}
      className={cn("select-none", className)}
    />
  )
}
