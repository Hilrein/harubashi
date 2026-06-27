import { useState, useEffect } from "react"
import { Button } from "./ui/button"

interface CreateProfileDialogProps {
  readonly isOpen: boolean
  readonly onClose: () => void
  readonly onCreated: () => void
  readonly activeProfileConfig: {
    readonly provider: string
    readonly model: string
  } | null
}

const PROVIDER_OPTIONS = [
  { value: "google", label: "Google Gemini" },
  { value: "nvidia", label: "NVIDIA NIM" },
  { value: "anthropic", label: "Anthropic" },
  { value: "openai", label: "OpenAI" },
  { value: "proxy", label: "Custom Proxy" },
]

const MODEL_PRESETS: Record<string, readonly string[]> = {
  google: ["gemini-1.5-pro", "gemini-1.5-flash", "gemini-2.5-flash"],
  nvidia: ["meta/llama-3.1-70b-instruct", "meta/llama-3.1-405b-instruct"],
  anthropic: ["claude-3-5-sonnet-latest", "claude-3-5-haiku-latest"],
  openai: ["gpt-4o", "gpt-4o-mini"],
  proxy: [],
}

export const CreateProfileDialog = ({
  isOpen,
  onClose,
  onCreated,
  activeProfileConfig,
}: CreateProfileDialogProps) => {
  const [name, setName] = useState("")
  const [provider, setProvider] = useState("google")
  const [apiKey, setApiKey] = useState("")
  const [modelOption, setModelOption] = useState("preset")
  const [selectedModel, setSelectedModel] = useState("gemini-1.5-flash")
  const [customModel, setCustomModel] = useState("")
  const [proxyBaseUrl, setProxyBaseUrl] = useState("http://localhost:8080/v1")
  const [telegramEnabled, setTelegramEnabled] = useState(false)
  const [telegramBotToken, setTelegramBotToken] = useState("")
  const [errorMsg, setErrorMsg] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Pre-fill defaults based on active profile (imitating CLI setup wizard clone behavior)
  useEffect(() => {
    if (isOpen && activeProfileConfig) {
      const activeProv = activeProfileConfig.provider
      const activeModel = activeProfileConfig.model
      setProvider(activeProv)

      const presets = MODEL_PRESETS[activeProv] || []
      if (presets.includes(activeModel)) {
        setModelOption("preset")
        setSelectedModel(activeModel)
      } else {
        setModelOption("custom")
        setCustomModel(activeModel)
      }
    }
  }, [isOpen, activeProfileConfig])

  if (!isOpen) return null

  const handleProviderChange = (newProvider: string) => {
    setProvider(newProvider)
    const presets = MODEL_PRESETS[newProvider] || []
    if (presets.length > 0) {
      setModelOption("preset")
      setSelectedModel(presets[0])
    } else {
      setModelOption("custom")
      setCustomModel("")
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrorMsg("")

    if (!name.trim()) {
      setErrorMsg("Profile name is required")
      return
    }

    if (!/^[a-z0-9_-]+$/i.test(name)) {
      setErrorMsg("Name must only contain letters, numbers, dashes or underscores")
      return
    }

    const finalModel = modelOption === "preset" ? selectedModel : customModel
    if (!finalModel.trim()) {
      setErrorMsg("Model identifier is required")
      return
    }

    setIsSubmitting(true)

    try {
      const response = await fetch("/api/profiles", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: name.trim(),
          provider,
          apiKey: apiKey || undefined,
          model: finalModel.trim(),
          proxyBaseUrl: provider === "proxy" ? proxyBaseUrl : undefined,
          telegramEnabled,
          telegramBotToken: telegramEnabled && telegramBotToken ? telegramBotToken : undefined,
        }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.message || `HTTP ${response.status}`)
      }

      onCreated()
      onClose()
      // reset form
      setName("")
      setApiKey("")
      setTelegramBotToken("")
      setTelegramEnabled(false)
    } catch (err) {
      setErrorMsg((err as Error).message || "Failed to create profile")
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg border border-border bg-card p-6 rounded-xl shadow-xl transition-all">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-medium tracking-tight">Create Profile</h2>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            aria-label="Close dialog"
            className="text-muted-foreground hover:text-foreground"
          >
            ✕
          </Button>
        </div>

        {errorMsg && (
          <div className="mb-4 rounded-lg bg-destructive/10 p-3 text-sm text-destructive border border-destructive/20">
            {errorMsg}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="name-input" className="block text-xs text-muted-foreground uppercase tracking-wider mb-1 font-medium">
              Profile Name
            </label>
            <input
              id="name-input"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. gpt4o-profile"
              className="w-full rounded-md border border-border/80 bg-background/50 px-3 py-2 text-sm outline-none focus:border-primary transition"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="provider-select" className="block text-xs text-muted-foreground uppercase tracking-wider mb-1 font-medium">
                LLM Provider
              </label>
              <select
                id="provider-select"
                value={provider}
                onChange={(e) => handleProviderChange(e.target.value)}
                className="w-full rounded-md border border-border/80 bg-background px-3 py-2 text-sm outline-none focus:border-primary transition"
              >
                {PROVIDER_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="api-key-input" className="block text-xs text-muted-foreground uppercase tracking-wider mb-1 font-medium">
                API Key (Optional)
              </label>
              <input
                id="api-key-input"
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="••••••••••••••••"
                className="w-full rounded-md border border-border/80 bg-background/50 px-3 py-2 text-sm outline-none focus:border-primary transition"
              />
            </div>
          </div>

          {provider === "proxy" && (
            <div>
              <label htmlFor="proxy-url-input" className="block text-xs text-muted-foreground uppercase tracking-wider mb-1 font-medium">
                Proxy Base URL
              </label>
              <input
                id="proxy-url-input"
                type="url"
                value={proxyBaseUrl}
                onChange={(e) => setProxyBaseUrl(e.target.value)}
                placeholder="http://localhost:8080/v1"
                className="w-full rounded-md border border-border/80 bg-background/50 px-3 py-2 text-sm outline-none focus:border-primary transition"
                required
              />
            </div>
          )}

          <div>
            <label className="block text-xs text-muted-foreground uppercase tracking-wider mb-1 font-medium">
              Model Configuration
            </label>
            <div className="flex gap-4 mb-2">
              {MODEL_PRESETS[provider]?.length > 0 && (
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="radio"
                    checked={modelOption === "preset"}
                    onChange={() => setModelOption("preset")}
                    className="accent-primary"
                  />
                  Choose Preset
                </label>
              )}
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="radio"
                  checked={modelOption === "custom"}
                  onChange={() => setModelOption("custom")}
                  className="accent-primary"
                />
                Custom Identifier
              </label>
            </div>

            {modelOption === "preset" && MODEL_PRESETS[provider]?.length > 0 ? (
              <select
                aria-label="Preset Model Select"
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value)}
                className="w-full rounded-md border border-border/80 bg-background px-3 py-2 text-sm outline-none focus:border-primary transition"
              >
                {MODEL_PRESETS[provider].map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            ) : (
              <input
                aria-label="Custom Model Input"
                type="text"
                value={customModel}
                onChange={(e) => setCustomModel(e.target.value)}
                placeholder="e.g. meta-llama/Llama-3-8b"
                className="w-full rounded-md border border-border/80 bg-background/50 px-3 py-2 text-sm outline-none focus:border-primary transition"
                required
              />
            )}
          </div>

          <div className="border-t border-border/50 pt-4 space-y-3">
            <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
              <input
                type="checkbox"
                checked={telegramEnabled}
                onChange={(e) => setTelegramEnabled(e.target.checked)}
                className="rounded border-border bg-background accent-primary h-4 w-4"
              />
              <span className="font-medium text-foreground">Enable Telegram Messaging</span>
            </label>

            {telegramEnabled && (
              <div>
                <label htmlFor="telegram-token-input" className="block text-xs text-muted-foreground uppercase tracking-wider mb-1 font-medium">
                  Telegram Bot Token
                </label>
                <input
                  id="telegram-token-input"
                  type="password"
                  value={telegramBotToken}
                  onChange={(e) => setTelegramBotToken(e.target.value)}
                  placeholder="e.g. 123456789:ABCdefGhI..."
                  className="w-full rounded-md border border-border/80 bg-background/50 px-3 py-2 text-sm outline-none focus:border-primary transition"
                  required={telegramEnabled}
                />
              </div>
            )}
          </div>

          <div className="flex justify-end gap-3 border-t border-border/50 pt-4 mt-6">
            <Button
              type="button"
              variant="ghost"
              onClick={onClose}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting}
              className="bg-primary hover:bg-primary/90 text-primary-foreground font-medium"
            >
              {isSubmitting ? "Creating..." : "Create Profile"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
