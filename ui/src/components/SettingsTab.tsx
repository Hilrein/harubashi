import { useEffect, useState } from "react"
import { useUiStore } from "@/lib/uiStore"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card"
import { Button } from "./ui/button"
import { Eye, EyeOff } from "lucide-react"

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

export const SettingsTab = () => {
  const activeProfile = useUiStore((state) => state.activeProfile)
  const fetchActiveProfileStatus = useUiStore((state) => state.fetchStatus)

  const [provider, setProvider] = useState("google")
  const [apiKey, setApiKey] = useState("")
  const [hasApiKey, setHasApiKey] = useState(false)
  const [modelOption, setModelOption] = useState("preset")
  const [selectedModel, setSelectedModel] = useState("gemini-1.5-flash")
  const [customModel, setCustomModel] = useState("")
  const [proxyBaseUrl, setProxyBaseUrl] = useState("http://localhost:8080/v1")
  const [telegramEnabled, setTelegramEnabled] = useState(false)
  const [telegramBotToken, setTelegramBotToken] = useState("")
  const [hasTelegramBotToken, setHasTelegramBotToken] = useState(false)

  const [showApiKey, setShowApiKey] = useState(false)
  const [showTelegramToken, setShowTelegramToken] = useState(false)

  const [isLoading, setIsLoading] = useState(true)
  const [toastMsg, setToastMsg] = useState("")
  const [errorMsg, setErrorMsg] = useState("")
  const [isSaving, setIsSaving] = useState(false)

  const fetchConfig = async () => {
    try {
      setIsLoading(true)
      const response = await fetch("/api/config")
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const data = await response.json()

      setProvider(data.provider)
      setHasApiKey(data.hasApiKey)
      setApiKey(data.hasApiKey ? "***" : "")

      const presets = MODEL_PRESETS[data.provider] || []
      if (presets.includes(data.model)) {
        setModelOption("preset")
        setSelectedModel(data.model)
      } else {
        setModelOption("custom")
        setCustomModel(data.model)
      }

      if (data.proxyBaseUrl) {
        setProxyBaseUrl(data.proxyBaseUrl)
      }

      setTelegramEnabled(data.telegramEnabled)
      setHasTelegramBotToken(data.hasTelegramBotToken)
      setTelegramBotToken(data.hasTelegramBotToken ? "***" : "")
    } catch {
      setErrorMsg("Failed to retrieve profile configuration settings.")
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchConfig()
  }, [activeProfile])

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

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrorMsg("")
    setToastMsg("")
    setIsSaving(true)

    const finalModel = modelOption === "preset" ? selectedModel : customModel
    if (!finalModel.trim()) {
      setErrorMsg("Model identifier is required")
      setIsSaving(false)
      return
    }

    try {
      const response = await fetch("/api/config", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          provider,
          apiKey: apiKey || undefined,
          model: finalModel.trim(),
          proxyBaseUrl: provider === "proxy" ? proxyBaseUrl : undefined,
          telegramEnabled,
          telegramBotToken: telegramEnabled && telegramBotToken ? telegramBotToken : undefined,
        }),
      })

      if (!response.ok) {
        const errData = await response.json()
        throw new Error(errData.message || `HTTP ${response.status}`)
      }

      setToastMsg("Configuration updated successfully!")
      await fetchActiveProfileStatus()
      await fetchConfig()

      setTimeout(() => {
        setToastMsg("")
      }, 3000)
    } catch (err) {
      setErrorMsg((err as Error).message || "Failed to update configuration")
    } finally {
      setIsSaving(false)
    }
  }

  if (isLoading) {
    return <div className="text-sm text-muted-foreground animate-pulse">Loading settings…</div>
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="border-b border-border/40 pb-4">
        <h2 className="text-2xl font-semibold tracking-tight">Profile Settings</h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          Configure API credentials, model selectors, and messaging for active environment:{" "}
          <span className="font-mono text-primary font-medium">{activeProfile}</span>
        </p>
      </div>

      {toastMsg && (
        <div className="rounded-lg bg-green-500/10 p-3 text-sm text-green-400 border border-green-500/20 transition-all duration-300">
          ✓ {toastMsg}
        </div>
      )}

      {errorMsg && (
        <div className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive border border-destructive/20 transition-all duration-300">
          ✕ {errorMsg}
        </div>
      )}

      <Card className="border border-border/60 bg-card/40">
        <CardHeader>
          <CardTitle className="text-lg font-medium">Provider Configuration</CardTitle>
          <CardDescription className="text-muted-foreground">
            Modify options for the LLM API providers.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSave} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="settings-provider" className="block text-xs text-muted-foreground uppercase tracking-wider mb-1 font-medium">
                  Provider
                </label>
                <select
                  id="settings-provider"
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
                <label htmlFor="settings-api-key" className="block text-xs text-muted-foreground uppercase tracking-wider mb-1 font-medium">
                  API Key
                </label>
                <div className="relative">
                  <input
                    id="settings-api-key"
                    type={showApiKey ? "text" : "password"}
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder={hasApiKey ? "••••••••••••••••" : "Enter API key"}
                    className="w-full rounded-md border border-border/80 bg-background/50 pl-3 pr-10 py-2 text-sm outline-none focus:border-primary transition font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => setShowApiKey((prev) => !prev)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground outline-none cursor-pointer"
                    tabIndex={0}
                    aria-label={showApiKey ? "Hide API key" : "Show API key"}
                  >
                    {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {hasApiKey && apiKey !== "***" && apiKey !== "" && (
                  <span className="text-[10px] text-primary/80 mt-1 block">Key modified, will overwrite on save</span>
                )}
              </div>
            </div>

            {provider === "proxy" && (
              <div>
                <label htmlFor="settings-proxy-url" className="block text-xs text-muted-foreground uppercase tracking-wider mb-1 font-medium">
                  Proxy Base URL
                </label>
                <input
                  id="settings-proxy-url"
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
                  <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
                    <input
                      type="radio"
                      checked={modelOption === "preset"}
                      onChange={() => setModelOption("preset")}
                      className="accent-primary"
                    />
                    Preset Model
                  </label>
                )}
                <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
                  <input
                    type="radio"
                    checked={modelOption === "custom"}
                    onChange={() => setModelOption("custom")}
                    className="accent-primary"
                  />
                  Custom Model ID
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
                  placeholder="e.g. gpt-4-turbo"
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
                  <label htmlFor="settings-telegram-token" className="block text-xs text-muted-foreground uppercase tracking-wider mb-1 font-medium">
                    Telegram Bot Token
                  </label>
                  <div className="relative">
                    <input
                      id="settings-telegram-token"
                      type={showTelegramToken ? "text" : "password"}
                      value={telegramBotToken}
                      onChange={(e) => setTelegramBotToken(e.target.value)}
                      placeholder={hasTelegramBotToken ? "••••••••••••••••" : "Enter bot token"}
                      className="w-full rounded-md border border-border/80 bg-background/50 pl-3 pr-10 py-2 text-sm outline-none focus:border-primary transition font-mono"
                      required={telegramEnabled}
                    />
                    <button
                      type="button"
                      onClick={() => setShowTelegramToken((prev) => !prev)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground outline-none cursor-pointer"
                      tabIndex={0}
                      aria-label={showTelegramToken ? "Hide token" : "Show token"}
                    >
                      {showTelegramToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  {hasTelegramBotToken && telegramBotToken !== "***" && telegramBotToken !== "" && (
                    <span className="text-[10px] text-primary/80 mt-1 block">Token modified, will overwrite on save</span>
                  )}
                </div>
              )}
            </div>

            <div className="flex justify-end pt-4">
              <Button
                type="submit"
                disabled={isSaving}
                className="bg-primary hover:bg-primary/90 text-primary-foreground font-medium px-6"
              >
                {isSaving ? "Saving..." : "Save Configuration"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
