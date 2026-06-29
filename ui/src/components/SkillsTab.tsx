import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card"
import { Cpu, BookOpen, Sparkles, AlertCircle } from "lucide-react"

interface SkillItem {
  readonly name: string
  readonly description: string
  readonly isTool: boolean
}

export const SkillsTab = () => {
  const [skills, setSkills] = useState<readonly SkillItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [errorMsg, setErrorMsg] = useState("")

  const fetchSkills = async () => {
    try {
      setIsLoading(true)
      const response = await fetch("/api/skills")
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const data = await response.json()
      setSkills(data)
    } catch (err) {
      setErrorMsg("Failed to retrieve skills directory information.")
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchSkills()
  }, [])

  if (isLoading) {
    return <div className="text-sm text-muted-foreground animate-pulse">Loading skills…</div>
  }

  if (errorMsg) {
    return (
      <div className="rounded-lg bg-destructive/10 p-4 border border-destructive/20 flex gap-3 text-destructive items-start">
        <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
        <div>
          <h4 className="font-medium text-sm">Failed to Load Skills</h4>
          <p className="text-xs mt-1 text-destructive/80">{errorMsg}</p>
        </div>
      </div>
    )
  }

  const activeTools = skills.filter((s) => s.isTool)
  const guidanceSkills = skills.filter((s) => !s.isTool)

  return (
    <div className="space-y-8 select-none">
      {/* Header Section */}
      <div className="border-b border-border/40 pb-4">
        <h2 className="text-2xl font-semibold tracking-tight">Agent Skills</h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          View custom workflows, tool definitions, and system guidance instructions loaded into the AI context.
        </p>
      </div>

      {/* Active Tools Section */}
      <div className="space-y-4">
        <div className="flex items-center gap-2 text-xs text-muted-foreground uppercase tracking-wider font-semibold">
          <Cpu className="h-4 w-4 text-primary" />
          <span>Active Tools ({activeTools.length})</span>
        </div>
        
        {activeTools.length === 0 ? (
          <p className="text-sm text-muted-foreground/80 italic pl-1">No active tools are currently configured.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {activeTools.map((tool) => (
              <Card key={tool.name} className="border border-border/50 bg-card/20 hover:bg-card/40 transition duration-300 group">
                <CardHeader className="pb-2">
                  <div className="flex justify-between items-start gap-3">
                    <CardTitle className="font-mono text-sm text-emerald-400 group-hover:text-emerald-300 transition">
                      {tool.name}
                    </CardTitle>
                    <span className="text-[9px] px-1.5 py-0.5 rounded border border-emerald-500/20 bg-emerald-500/10 text-emerald-400 font-semibold tracking-wide uppercase shrink-0">
                      Callable
                    </span>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {tool.description}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Guidance Section */}
      <div className="space-y-4">
        <div className="flex items-center gap-2 text-xs text-muted-foreground uppercase tracking-wider font-semibold">
          <BookOpen className="h-4 w-4 text-amber-500" />
          <span>System Guidance ({guidanceSkills.length})</span>
        </div>

        {guidanceSkills.length === 0 ? (
          <p className="text-sm text-muted-foreground/80 italic pl-1">No system guidance templates found.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {guidanceSkills.map((guide) => (
              <Card key={guide.name} className="border border-border/50 bg-card/20 hover:bg-card/40 transition duration-300 group">
                <CardHeader className="pb-2">
                  <div className="flex justify-between items-start gap-3">
                    <CardTitle className="font-mono text-sm text-amber-400 group-hover:text-amber-300 transition">
                      {guide.name}
                    </CardTitle>
                    <div className="flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded border border-amber-500/20 bg-amber-500/10 text-amber-400 font-semibold tracking-wide uppercase shrink-0">
                      <Sparkles className="h-2.5 w-2.5" />
                      <span>Guidance</span>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {guide.description}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
