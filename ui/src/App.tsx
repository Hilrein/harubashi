import { useEffect } from "react"
import { useUiStore } from "@/lib/uiStore"
import type { TabName } from "@/lib/uiStore"
import { ProfilesTab } from "@/components/ProfilesTab"
import {
  MessageSquare,
  Users,
  Settings,
  Terminal,
  Lightbulb,
} from "lucide-react"

interface SidebarItem {
  readonly id: TabName
  readonly label: string
  readonly icon: React.ComponentType<{ className?: string }>
}

const SIDEBAR_ITEMS: readonly SidebarItem[] = [
  { id: "chat", label: "Chat", icon: MessageSquare },
  { id: "profiles", label: "Profiles", icon: Users },
  { id: "skills", label: "Skills", icon: Lightbulb },
  { id: "logs", label: "Logs", icon: Terminal },
  { id: "settings", label: "Settings", icon: Settings },
]

const App = () => {
  const activeTab = useUiStore((state) => state.activeTab)
  const activeProfile = useUiStore((state) => state.activeProfile)
  const setActiveTab = useUiStore((state) => state.setActiveTab)
  const fetchStatus = useUiStore((state) => state.fetchStatus)

  useEffect(() => {
    fetchStatus()
    // Poll status periodically (every 5 seconds) to ensure synchronization
    const timer = setInterval(() => {
      fetchStatus()
    }, 5000)
    return () => clearInterval(timer)
  }, [fetchStatus])

  const renderContent = () => {
    switch (activeTab) {
      case "profiles":
        return <ProfilesTab />
      case "chat":
        return (
          <div className="flex flex-col items-center justify-center min-h-[60vh] text-center max-w-md mx-auto space-y-4">
            <MessageSquare className="h-10 w-10 text-muted-foreground/60" />
            <h2 className="text-xl font-medium tracking-tight">Interactive Chat</h2>
            <p className="text-sm text-muted-foreground">
              Interact with the active agent sessions directly. This tab is currently placeholder and will be completed in future batches.
            </p>
          </div>
        )
      case "skills":
        return (
          <div className="flex flex-col items-center justify-center min-h-[60vh] text-center max-w-md mx-auto space-y-4">
            <Lightbulb className="h-10 w-10 text-muted-foreground/60" />
            <h2 className="text-xl font-medium tracking-tight">Skills Manager</h2>
            <p className="text-sm text-muted-foreground">
              Configure and test cognitive agent skills. This tab is currently placeholder and will be completed in future batches.
            </p>
          </div>
        )
      case "logs":
        return (
          <div className="flex flex-col items-center justify-center min-h-[60vh] text-center max-w-md mx-auto space-y-4">
            <Terminal className="h-10 w-10 text-muted-foreground/60" />
            <h2 className="text-xl font-medium tracking-tight">System Logs</h2>
            <p className="text-sm text-muted-foreground">
              Inspect backend logs in real-time. This tab is currently placeholder and will be completed in future batches.
            </p>
          </div>
        )
      case "settings":
        return (
          <div className="flex flex-col items-center justify-center min-h-[60vh] text-center max-w-md mx-auto space-y-4">
            <Settings className="h-10 w-10 text-muted-foreground/60" />
            <h2 className="text-xl font-medium tracking-tight">Settings</h2>
            <p className="text-sm text-muted-foreground">
              Manage global configurations and preferences. This tab is currently placeholder and will be completed in future batches.
            </p>
          </div>
        )
      default:
        return null
    }
  }

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background text-foreground">
      {/* ── Side Navigation Sidebar ─────────────────────────── */}
      <aside className="w-64 border-r border-border/40 bg-card/10 flex flex-col justify-between h-full select-none">
        <div>
          {/* Logo */}
          <div className="px-6 py-6 flex items-center gap-2">
            <span className="font-semibold text-lg tracking-tight font-mono">harubashi</span>
            <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded border border-border/80 text-muted-foreground">
              v0.1.6
            </span>
          </div>

          {/* Navigation menu */}
          <nav className="px-4 space-y-1.5">
            {SIDEBAR_ITEMS.map((item) => {
              const Icon = item.icon
              const isActive = activeTab === item.id

              return (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  tabIndex={0}
                  aria-label={`Navigate to ${item.label}`}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all duration-200 outline-none focus-visible:ring-1 focus-visible:ring-primary/50 ${
                    isActive
                      ? "bg-accent/80 text-foreground font-medium border border-border/30"
                      : "text-muted-foreground hover:text-foreground hover:bg-accent/30"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </button>
              )
            })}
          </nav>
        </div>

        {/* Active Profile Indicator Bottom */}
        <div className="p-4 border-t border-border/40 bg-card/25">
          <div className="flex flex-col gap-1">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
              Active Environment
            </span>
            <div className="flex items-center gap-2 mt-1">
              <span className="inline-block h-2 w-2 rounded-full bg-green-500 animate-pulse" />
              <span className="text-sm font-medium font-mono text-foreground/90">
                {activeProfile || "loading..."}
              </span>
            </div>
          </div>
        </div>
      </aside>

      {/* ── Main Workspace Area ────────────────────────────── */}
      <main className="flex-1 overflow-y-auto bg-background/50 p-8">
        <div className="max-w-6xl mx-auto">
          {renderContent()}
        </div>
      </main>
    </div>
  )
}

export default App
