import { useEffect, useState } from "react"
import { useUiStore } from "@/lib/uiStore"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card"
import { Button } from "./ui/button"
import { CreateProfileDialog } from "./CreateProfileDialog"

interface ProfileItem {
  readonly name: string
  readonly provider: string
  readonly model: string
  readonly dbStatus: "exists" | "missing"
  readonly isActive: boolean
}

export const ProfilesTab = () => {
  const [profiles, setProfiles] = useState<readonly ProfileItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [errorMsg, setErrorMsg] = useState("")
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const fetchActiveProfile = useUiStore((state) => state.fetchStatus)

  const fetchProfiles = async () => {
    try {
      const response = await fetch("/api/profiles")
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const data = await response.json()
      setProfiles(data)
    } catch (err) {
      setErrorMsg("Failed to retrieve configuration profiles.")
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchProfiles()
  }, [])

  const handleSwitchProfile = async (name: string) => {
    try {
      const response = await fetch("/api/profiles/use", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name }),
      })

      if (!response.ok) throw new Error("Switch command failed")
      
      // Update global UI state & refetch list
      await fetchActiveProfile()
      await fetchProfiles()
    } catch (err) {
      setErrorMsg(`Failed to switch active profile to "${name}"`)
    }
  }

  // Active configuration mapping to pre-fill the clone form
  const activeItem = profiles.find((p) => p.isActive)
  const activeProfileConfig = activeItem
    ? { provider: activeItem.provider, model: activeItem.model }
    : null

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between border-b border-border/40 pb-4">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Configuration Profiles</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Switch provider environments or bootstrap new SQLite databases.
          </p>
        </div>
        <Button
          onClick={() => setIsDialogOpen(true)}
          className="bg-primary hover:bg-primary/90 text-primary-foreground font-medium"
        >
          Create Profile
        </Button>
      </div>

      {errorMsg && (
        <div className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive border border-destructive/20">
          {errorMsg}
        </div>
      )}

      {isLoading ? (
        <div className="text-sm text-muted-foreground animate-pulse">
          Loading profiles…
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {profiles.map((profile) => (
            <Card
              key={profile.name}
              className={`border transition-all duration-300 relative ${
                profile.isActive
                  ? "border-primary/50 bg-primary/5"
                  : "border-border/60 hover:border-border/80 bg-card/40"
              }`}
            >
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-base font-semibold font-mono tracking-tight">
                      {profile.name}
                    </CardTitle>
                    <CardDescription className="text-xs mt-0.5 uppercase tracking-wider font-mono">
                      {profile.provider}
                    </CardDescription>
                  </div>
                  {profile.isActive && (
                    <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
                      ✓ active
                    </span>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-3 pb-4">
                <div className="space-y-1.5 text-xs font-mono">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Model:</span>
                    <span className="text-foreground/90 truncate max-w-[180px]">
                      {profile.model}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Database:</span>
                    <span
                      className={`font-semibold ${
                        profile.dbStatus === "exists" ? "text-green-400" : "text-amber-400"
                      }`}
                    >
                      {profile.dbStatus === "exists" ? "Ready" : "Missing"}
                    </span>
                  </div>
                </div>

                {!profile.isActive && (
                  <Button
                    onClick={() => handleSwitchProfile(profile.name)}
                    variant="secondary"
                    size="sm"
                    className="w-full text-xs font-medium border border-border/40 hover:border-border mt-2"
                  >
                    Switch Profile
                  </Button>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <CreateProfileDialog
        isOpen={isDialogOpen}
        onClose={() => setIsDialogOpen(false)}
        onCreated={() => {
          fetchProfiles()
          fetchActiveProfile()
        }}
        activeProfileConfig={activeProfileConfig}
      />
    </div>
  )
}
