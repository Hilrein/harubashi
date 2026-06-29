import { useEffect } from "react"
import { BrowserRouter, Routes, Route, NavLink, Navigate } from "react-router-dom"
import { useUiStore } from "@/lib/uiStore"
import { ProfilesTab } from "@/components/ProfilesTab"
import { SettingsTab } from "@/components/SettingsTab"
import { LogsTab } from "@/components/LogsTab"
import { SkillsTab } from "@/components/SkillsTab"
import { ChatTab } from "@/components/ChatTab"
import {
  MessageSquare,
  Users,
  Settings,
  Terminal,
  Lightbulb,
} from "lucide-react"

interface SidebarItem {
  readonly path: string
  readonly label: string
  readonly icon: React.ComponentType<{ className?: string }>
}

const SIDEBAR_ITEMS: readonly SidebarItem[] = [
  { path: "/chat", label: "Chat", icon: MessageSquare },
  { path: "/profiles", label: "Profiles", icon: Users },
  { path: "/skills", label: "Skills", icon: Lightbulb },
  { path: "/logs", label: "Logs", icon: Terminal },
  { path: "/settings", label: "Settings", icon: Settings },
]

const AppContent = () => {
  const activeProfile = useUiStore((state) => state.activeProfile)
  const fetchStatus = useUiStore((state) => state.fetchStatus)

  useEffect(() => {
    fetchStatus()
    const timer = setInterval(() => {
      fetchStatus()
    }, 5000)
    return () => clearInterval(timer)
  }, [fetchStatus])

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

              return (
                <NavLink
                  key={item.path}
                  to={item.path}
                  aria-label={`Navigate to ${item.label}`}
                  className={({ isActive }) =>
                    `w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all duration-200 outline-none focus-visible:ring-1 focus-visible:ring-primary/50 ${
                      isActive
                        ? "bg-accent/80 text-foreground font-medium border border-border/30"
                        : "text-muted-foreground hover:text-foreground hover:bg-accent/30"
                    }`
                  }
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </NavLink>
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
          <Routes>
            <Route path="/" element={<Navigate to="/profiles" replace />} />
            <Route path="/profiles" element={<ProfilesTab />} />
            <Route path="/settings" element={<SettingsTab />} />
            <Route path="/logs" element={<LogsTab />} />
            <Route path="/chat" element={<ChatTab />} />
            <Route path="/skills" element={<SkillsTab />} />
            <Route path="*" element={<Navigate to="/profiles" replace />} />
          </Routes>
        </div>
      </main>
    </div>
  )
}

const App = () => {
  return (
    <BrowserRouter>
      <AppContent />
    </BrowserRouter>
  )
}

export default App
