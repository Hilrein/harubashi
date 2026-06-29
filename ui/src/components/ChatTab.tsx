import { useEffect, useRef, useState } from "react"
import { Button } from "./ui/button"
import { MessageSquare, Send, Plus, Lock, AlertCircle } from "lucide-react"

interface UserProfile {
  readonly id: string
  readonly name: string | null
  readonly telegramId: string | null
}

interface ChatSession {
  readonly id: string
  readonly title: string | null
  readonly status: "ACTIVE" | "ARCHIVED"
  readonly createdAt: string
  readonly updatedAt: string
  readonly user?: UserProfile | null
}

interface Message {
  readonly id: string
  readonly taskId: string
  readonly role: "USER" | "ASSISTANT"
  readonly content: string
  readonly createdAt: string
}

export const ChatTab = () => {
  const [sessions, setSessions] = useState<readonly ChatSession[]>([])
  const [activeSession, setActiveSession] = useState<ChatSession | null>(null)
  const [messages, setMessages] = useState<readonly Message[]>([])
  const [prompt, setPrompt] = useState("")
  const [isTelegramConfirmed, setIsTelegramConfirmed] = useState(false)
  const [isSending, setIsSending] = useState(false)
  const [isLoadingSessions, setIsLoadingSessions] = useState(true)
  const [isLoadingMessages, setIsLoadingMessages] = useState(false)

  const messagesEndRef = useRef<HTMLDivElement | null>(null)

  const fetchSessions = async () => {
    try {
      setIsLoadingSessions(true)
      const res = await fetch("/api/chat/sessions")
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      setSessions(data)

      // Auto select first session if none selected
      if (data.length > 0 && !activeSession) {
        setActiveSession(data[0])
      }
    } catch {
      // Ignore silently
    } finally {
      setIsLoadingSessions(false)
    }
  }

  const fetchMessages = async (sessionId: string) => {
    try {
      setIsLoadingMessages(true)
      const res = await fetch(`/api/chat/messages/${sessionId}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      setMessages(data)
    } catch {
      // Ignore silently
    } finally {
      setIsLoadingMessages(false)
    }
  }

  const handleCreateSession = async () => {
    try {
      const res = await fetch("/api/chat/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: `Session #${sessions.length + 1}` }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const newSession = await res.json()
      setSessions((prev) => [newSession, ...prev])
      setActiveSession(newSession)
      setMessages([])
    } catch {
      // Ignore silently
    }
  }

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!activeSession || !prompt.trim() || isSending) return

    // Safeguard constraint check
    const isTelegramSession = !!activeSession.user?.telegramId
    if (isTelegramSession && !isTelegramConfirmed) return

    try {
      setIsSending(true)
      const res = await fetch(`/api/chat/messages/${activeSession.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: prompt.trim() }),
      })

      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const newMsgs = await res.json()
      setMessages((prev) => [...prev, ...newMsgs])
      setPrompt("")
      setIsTelegramConfirmed(false) // Reset safety toggle
    } catch {
      // Ignore silently
    } finally {
      setIsSending(false)
    }
  }

  useEffect(() => {
    fetchSessions()
  }, [])

  useEffect(() => {
    if (activeSession) {
      fetchMessages(activeSession.id)
      setIsTelegramConfirmed(false)
    }
  }, [activeSession])

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" })
    }
  }, [messages])

  const isTelegramSession = !!activeSession?.user?.telegramId
  const isInputDisabled = isSending || (isTelegramSession && !isTelegramConfirmed)

  return (
    <div className="h-[calc(100vh-10rem)] border border-border/40 rounded-xl overflow-hidden flex bg-card/10 select-none">
      {/* Sidebar - Sessions List */}
      <div className="w-80 border-r border-border/40 flex flex-col bg-background/20">
        <div className="p-4 border-b border-border/40 flex items-center justify-between">
          <h3 className="font-semibold text-sm tracking-tight">Dialogues</h3>
          <Button
            variant="outline"
            size="sm"
            onClick={handleCreateSession}
            className="h-7 w-7 p-0 flex items-center justify-center border-border/60 hover:border-border"
            title="New Dialogue"
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-1 scrollbar-thin">
          {isLoadingSessions ? (
            <div className="text-xs text-muted-foreground p-3 animate-pulse">Loading sessions…</div>
          ) : sessions.length === 0 ? (
            <div className="text-xs text-muted-foreground p-4 text-center">No active dialogues. Click + to begin.</div>
          ) : (
            sessions.map((session) => {
              const isActive = activeSession?.id === session.id
              const isTg = !!session.user?.telegramId
              return (
                <button
                  key={session.id}
                  onClick={() => setActiveSession(session)}
                  className={`w-full text-left p-3 rounded-lg transition duration-200 flex flex-col gap-1 outline-none text-xs ${
                    isActive
                      ? "bg-primary/10 border border-primary/20 text-foreground"
                      : "hover:bg-muted/40 text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <div className="flex justify-between items-center w-full">
                    <span className="font-medium truncate pr-2">{session.title || "Untitled Session"}</span>
                    {isTg && (
                      <span className="text-[8px] border border-sky-500/20 bg-sky-500/10 text-sky-400 font-semibold px-1 rounded-sm tracking-wider uppercase shrink-0">
                        Telegram
                      </span>
                    )}
                  </div>
                  <span className="text-[10px] text-muted-foreground/60 font-mono">
                    {new Date(session.updatedAt).toLocaleDateString()}
                  </span>
                </button>
              )
            })
          )}
        </div>
      </div>

      {/* Main Dialogue Window */}
      <div className="flex-1 flex flex-col bg-background/5">
        {activeSession ? (
          <>
            {/* Header */}
            <div className="px-6 py-4 border-b border-border/40 flex items-center justify-between bg-card/20">
              <div>
                <h4 className="text-sm font-semibold tracking-tight">{activeSession.title || "Active Session"}</h4>
                <p className="text-[11px] text-muted-foreground mt-0.5 font-mono">
                  ID: {activeSession.id}
                </p>
              </div>

              {isTelegramSession && (
                <div className="flex items-center gap-1.5 text-xs text-sky-400 font-medium">
                  <Lock className="h-3.5 w-3.5" />
                  <span>External Telegram session</span>
                </div>
              )}
            </div>

            {/* Message History */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6 scrollbar-thin">
              {isLoadingMessages ? (
                <div className="text-xs text-muted-foreground p-3 animate-pulse">Loading message history…</div>
              ) : messages.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center p-8 select-none">
                  <MessageSquare className="h-8 w-8 text-muted-foreground/40 mb-3" />
                  <p className="text-xs text-muted-foreground">This dialogue is currently empty.</p>
                  <p className="text-[10px] text-muted-foreground/60 mt-1">Send a message below to start the interaction.</p>
                </div>
              ) : (
                messages.map((msg) => (
                  <div key={msg.id} className="group border-b border-border/10 pb-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className={`text-[10px] uppercase font-mono tracking-wider font-semibold ${
                        msg.role === "USER" ? "text-primary" : "text-emerald-400"
                      }`}>
                        {msg.role === "USER" ? "User" : "Harubashi Agent"}
                      </span>
                      <span className="text-[9px] text-muted-foreground/40 font-mono">
                        {new Date(msg.createdAt).toLocaleTimeString()}
                      </span>
                    </div>
                    <div className="text-xs text-foreground/90 whitespace-pre-wrap leading-relaxed">
                      {msg.content}
                    </div>
                  </div>
                ))
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Prompt Input Form */}
            <div className="p-4 border-t border-border/40 bg-card/10">
              <form onSubmit={handleSendMessage} className="space-y-3">
                {isTelegramSession && (
                  <div className="flex items-start gap-2 rounded-lg bg-sky-500/5 p-3 border border-sky-500/10 text-xs text-sky-400/90 leading-normal">
                    <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                    <div className="flex-1 space-y-2">
                      <p>
                        This dialogue is active in a Telegram group or channel. Prompting here will send message updates directly to the external chat room.
                      </p>
                      <label className="flex items-center gap-2 cursor-pointer select-none font-medium mt-1">
                        <input
                          type="checkbox"
                          checked={isTelegramConfirmed}
                          onChange={(e) => setIsTelegramConfirmed(e.target.checked)}
                          className="rounded border-sky-500 bg-background accent-sky-500 h-3.5 w-3.5"
                        />
                        <span>Confirm output transmission to external Telegram chat</span>
                      </label>
                    </div>
                  </div>
                )}

                <div className="flex gap-2">
                  <input
                    type="text"
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    placeholder={
                      isTelegramSession && !isTelegramConfirmed
                        ? "Check confirm box to authorize output text transmission…"
                        : "Type prompt message…"
                    }
                    disabled={isInputDisabled}
                    className="flex-1 rounded-md border border-border/80 bg-background/50 px-3 py-2 text-sm outline-none focus:border-primary disabled:opacity-50 transition"
                    required
                  />
                  <Button
                    type="submit"
                    disabled={isInputDisabled || !prompt.trim()}
                    className="bg-primary hover:bg-primary/90 text-primary-foreground h-9 px-4 font-medium"
                  >
                    <Send className="h-4 w-4" />
                  </Button>
                </div>
              </form>
            </div>
          </>
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-center p-8 select-none">
            <MessageSquare className="h-10 w-10 text-muted-foreground/20 mb-3" />
            <h4 className="text-sm font-semibold">No Dialogue Selected</h4>
            <p className="text-xs text-muted-foreground max-w-xs mt-1">
              Select an existing dialogue session from the left sidebar or create a new session.
            </p>
            <Button onClick={handleCreateSession} className="mt-4 text-xs font-semibold px-4">
              Create New Dialogue
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
