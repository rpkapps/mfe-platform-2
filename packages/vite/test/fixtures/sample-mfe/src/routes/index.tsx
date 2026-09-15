import { createFileRoute } from "@tanstack/react-router"

export const Route = createFileRoute("/")({
  component: Home,
  staticData: {
    breadcrumb: "Home",
    navigation: { title: "Home", description: "Landing page", order: 1, keywords: ["start"] },
  },
})

function Home() {
  return <div className="sample-card">Home</div>
}
