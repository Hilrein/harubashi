import { useEffect, useRef, useState } from "react"
import { Card, CardContent } from "./ui/card"

interface LogLine {
  readonly id: string
  readonly rawText: string
  readonly timestamp: string
  readonly level: "info" | "warn" | "error" | "debug" | "verbose" | "raw"
  readonly context: string
  readonly message: string
}

export const LogsTab = () => {
  const [logs, setLogs] = useState<readonly LogLine[]>([])
  const [isConnected, setIsConnected] = useState(false)
  const logContainerRef = useRef<HTMLDivElement | null>(null)

  const parseLogLine = (rawText: string): LogLine => {
    const id = Math.random().toString(36).substring(2, 9)
    try {
      // Winston prints JSON objects per line
      const parsed = JSON.parse(rawText)
      const level = (parsed.level || "info").toLowerCase() as LogLine["level"]
      
      let ts = parsed.timestamp || ""
      const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}:\d{2})/.exec(ts)
      if (match) {
        ts = `${match[1]} ${match[2]}`
      }

      return {
        id,
        rawText,
        timestamp: ts,
        level,
        context: parsed.context || "",
        message: parsed.message || rawText,
      }
    } catch {
      // Fallback for non-JSON lines or Nest start lines e.g. "[WebUI] LOG ..."
      let level: LogLine["level"] = "raw"
      let message = rawText
      let context = ""
      let timestamp = ""

      // Match Winston console format: "[WebUI] 12345 27.06.2026, 18:38:13  LOG [InstanceLoader]..."
      // Or Nest default format: "2026-06-27 18:38:13  [InstanceLoader]..."
      const lower = rawText.toLowerCase()
      if (lower.includes("error") || lower.includes("exception")) {
        level = "error"
      } else if (lower.includes("warn")) {
        level = "warn"
      } else if (lower.includes("log") || lower.includes("info")) {
        level = "info"
      } else if (lower.includes("debug")) {
        level = "debug"
      }

      // Try extract context inside brackets
      const contextMatch = /\[([^\]]+)\]/.exec(rawText)
      if (contextMatch) {
        context = contextMatch[1]
      }

      return {
        id,
        rawText,
        timestamp,
        level,
        context,
        message,
      }
    }
  }

  useEffect(() => {
    setIsConnected(true)
    const eventSource = new EventSource("/api/logs/stream")

    eventSource.onmessage = (event) => {
      if (!event.data) return
      const parsedLine = parseLogLine(event.data)
      setLogs((prev) => [...prev.slice(-199), parsedLine]) // limit buffer to last 200 lines to save RAM
    }

    eventSource.onerror = () => {
      setIsConnected(false)
      eventSource.close()
    }

    return () => {
      eventSource.close()
    }
  }, [])

  // Auto scroll to bottom
  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight
    }
  }, [logs])

  const getLineColor = (level: LogLine["level"]) => {
    switch (level) {
      case "error":
        return "text-red-400 font-semibold"
      case "warn":
        return "text-amber-400 font-semibold"
      case "info":
        return "text-emerald-400"
      case "debug":
        return "text-blue-400"
      case "verbose":
        return "text-purple-400"
      default:
        return "text-foreground/70"
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between border-b border-border/40 pb-4">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">System Logs</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Streaming live server updates via Server-Sent Events (SSE).
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-xs">
            <span
              className={`h-2.5 w-2.5 rounded-full ${
                isConnected ? "bg-green-500 animate-pulse" : "bg-red-500"
              }`}
            />
            <span className="text-muted-foreground">
              {isConnected ? "Connected" : "Disconnected"}
            </span>
          </div>
        </div>
      </div>

      <Card className="border border-border/60 bg-black/80 shadow-2xl">
        <CardContent className="p-0">
          {/* Terminal Box */}
          <div
            ref={logContainerRef}
            className="h-[60vh] overflow-y-auto p-4 font-mono text-xs leading-relaxed scrollbar-thin select-text scroll-smooth"
            aria-live="polite"
            role="log"
          >
            {logs.length === 0 ? (
              <div className="text-muted-foreground/55 text-center pt-24">
                (no logs received yet)
              </div>
            ) : (
              logs.map((log) => (
                <div key={log.id} className="py-0.5 border-b border-white/[0.02] flex gap-2">
                  {log.timestamp && (
                    <span className="text-muted-foreground/50 select-none">
                      [{log.timestamp}]
                    </span>
                  )}
                  {log.context && (
                    <span className="text-cyan-400/90 select-none font-semibold">
                      [{log.context}]
                    </span>
                  )}
                  <span className={`${getLineColor(log.level)} break-all`}>
                    {log.message}
                  </span>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
export default LogsTab
