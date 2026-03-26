'use client'

import { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'

interface RuntimeSetupModalProps {
  runtime: 'openclaw' | 'hermes'
  onClose: () => void
  onComplete: () => void
}

export function RuntimeSetupModal({ runtime, onClose, onComplete }: RuntimeSetupModalProps) {
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="bg-card border border-border rounded-xl max-w-lg w-full max-h-[80vh] overflow-y-auto shadow-2xl shadow-black/30">
        {runtime === 'openclaw' ? (
          <OpenClawSetup onClose={onClose} onComplete={onComplete} />
        ) : (
          <HermesSetup onClose={onClose} onComplete={onComplete} />
        )}
      </div>
    </div>
  )
}

// ─── OpenClaw Setup ──────────────────────────────────────────────────────

function OpenClawSetup({ onClose, onComplete }: { onClose: () => void; onComplete: () => void }) {
  const [step, setStep] = useState<'onboard' | 'verify' | 'done'>('onboard')
  const [running, setRunning] = useState(false)
  const [output, setOutput] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [healthStatus, setHealthStatus] = useState<any>(null)

  const runOnboard = useCallback(async () => {
    setRunning(true)
    setError(null)
    setOutput('')
    try {
      const res = await fetch('/api/agent-runtimes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'install', runtime: 'openclaw', mode: 'local' }),
      })
      // The onboard command runs as part of post-install in agent-runtimes.ts
      // Let's use the doctor endpoint to check health instead
      const doctorRes = await fetch('/api/openclaw/doctor')
      if (doctorRes.ok) {
        const data = await doctorRes.json()
        setHealthStatus(data)
        if (data.healthy) {
          setStep('done')
        } else {
          setStep('verify')
          setOutput(data.issues?.join('\n') || 'Some issues detected')
        }
      } else {
        setStep('verify')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Setup failed')
    } finally {
      setRunning(false)
    }
  }, [])

  const runDoctorFix = useCallback(async () => {
    setRunning(true)
    setError(null)
    try {
      const res = await fetch('/api/openclaw/doctor', { method: 'POST' })
      if (res.ok) {
        const data = await res.json()
        if (data.success) {
          setStep('done')
          setOutput('All issues resolved')
        } else {
          setOutput(data.output || 'Fix attempt completed with warnings')
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Doctor fix failed')
    } finally {
      setRunning(false)
    }
  }, [])

  const checkHealth = useCallback(async () => {
    try {
      const res = await fetch('/api/openclaw/doctor')
      if (res.ok) {
        const data = await res.json()
        setHealthStatus(data)
        if (data.healthy) setStep('done')
      }
    } catch {
      // ignore
    }
  }, [])

  useEffect(() => { checkHealth() }, [checkHealth])

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-lg font-semibold">Set Up OpenClaw</h3>
          <p className="text-xs text-muted-foreground mt-0.5">Configure the gateway and verify connectivity</p>
        </div>
        <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground">
          <svg className="w-5 h-5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M4 4l8 8M12 4l-8 8" /></svg>
        </button>
      </div>

      {/* Step indicators */}
      <div className="flex items-center gap-2 mb-6">
        {(['onboard', 'verify', 'done'] as const).map((s, i) => (
          <div key={s} className="flex items-center gap-2">
            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold ${
              step === s ? 'bg-primary text-primary-foreground' :
              (['onboard', 'verify', 'done'].indexOf(step) > i) ? 'bg-green-500/20 text-green-400' :
              'bg-secondary text-muted-foreground'
            }`}>
              {(['onboard', 'verify', 'done'].indexOf(step) > i) ? (
                <svg className="w-3 h-3" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M3 8.5l3.5 3.5 6.5-8" /></svg>
              ) : i + 1}
            </div>
            {i < 2 && <div className={`w-8 h-px ${(['onboard', 'verify', 'done'].indexOf(step) > i) ? 'bg-green-500/40' : 'bg-border/30'}`} />}
          </div>
        ))}
      </div>

      {step === 'onboard' && (
        <div className="space-y-4">
          <div className="p-4 rounded-lg border border-border/30 bg-secondary/20 space-y-3">
            <div className="flex items-start gap-3">
              <span className="text-lg">1</span>
              <div>
                <p className="text-sm font-medium">Health Check</p>
                <p className="text-xs text-muted-foreground">Run OpenClaw doctor to check gateway configuration and connectivity.</p>
              </div>
            </div>
          </div>

          {error && <p className="text-xs text-red-400">{error}</p>}

          {healthStatus?.healthy && (
            <div className="p-3 rounded-lg border border-green-500/30 bg-green-500/5 text-xs text-green-400">
              OpenClaw is healthy and properly configured.
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={onClose}>Skip</Button>
            <Button size="sm" onClick={runOnboard} disabled={running}>
              {running ? 'Checking...' : 'Run Health Check'}
            </Button>
          </div>
        </div>
      )}

      {step === 'verify' && (
        <div className="space-y-4">
          <div className="p-4 rounded-lg border border-amber-500/20 bg-amber-500/5 space-y-2">
            <p className="text-sm font-medium text-amber-400">Issues Detected</p>
            {healthStatus?.issues?.map((issue: string, i: number) => (
              <p key={i} className="text-xs text-muted-foreground">- {issue}</p>
            ))}
            {output && <pre className="text-xs text-muted-foreground/70 whitespace-pre-wrap mt-2">{output}</pre>}
          </div>

          {error && <p className="text-xs text-red-400">{error}</p>}

          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={onClose}>Skip for now</Button>
            <Button size="sm" onClick={runDoctorFix} disabled={running}>
              {running ? 'Fixing...' : 'Auto-Fix Issues'}
            </Button>
          </div>
        </div>
      )}

      {step === 'done' && (
        <div className="space-y-4">
          <div className="p-4 rounded-lg border border-green-500/30 bg-green-500/5 text-center space-y-2">
            <div className="text-2xl">+</div>
            <p className="text-sm font-medium text-green-400">OpenClaw is ready</p>
            <p className="text-xs text-muted-foreground">Gateway is configured and healthy. Agents can now connect.</p>
          </div>

          <div className="flex justify-end">
            <Button size="sm" onClick={onComplete}>Done</Button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Hermes Setup ────────────────────────────────────────────────────────

function HermesSetup({ onClose, onComplete }: { onClose: () => void; onComplete: () => void }) {
  const [step, setStep] = useState<'hook' | 'provider' | 'identity' | 'gateway' | 'ready'>('hook')
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hermesStatus, setHermesStatus] = useState<any>(null)
  const [providerKey, setProviderKey] = useState('')
  const [providerType, setProviderType] = useState<'anthropic' | 'openai' | 'openai_oauth' | 'openrouter' | 'nous' | 'google' | 'xai'>('anthropic')
  const [providerSaved, setProviderSaved] = useState(false)
  const [soulContent, setSoulContent] = useState('')

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/hermes')
      if (res.ok) {
        const data = await res.json()
        setHermesStatus(data)
        if (data.hookInstalled && step === 'hook') {
          setStep('provider')
        }
      }
    } catch {
      // ignore
    }
  }, [step])

  useEffect(() => { fetchStatus() }, [fetchStatus])

  const installHook = useCallback(async () => {
    setRunning(true)
    setError(null)
    try {
      const res = await fetch('/api/hermes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'install-hook' }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Failed to install hook')
      }
      await fetchStatus()
      setStep('provider')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to install hook')
    } finally {
      setRunning(false)
    }
  }, [fetchStatus])

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-lg font-semibold">Set Up Hermes</h3>
          <p className="text-xs text-muted-foreground mt-0.5">Connect Hermes agent to Mission Control</p>
        </div>
        <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground">
          <svg className="w-5 h-5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M4 4l8 8M12 4l-8 8" /></svg>
        </button>
      </div>

      {/* Step indicators */}
      {(() => {
        const steps = ['hook', 'provider', 'identity', 'gateway', 'ready'] as const
        const currentIdx = steps.indexOf(step)
        const labels = ['Hook', 'Provider', 'Identity', 'Gateway', 'Ready']
        return (
          <div className="flex items-center gap-1.5 mb-6">
            {steps.map((s, i) => (
              <div key={s} className="flex items-center gap-1.5">
                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold transition-colors ${
                  step === s ? 'bg-primary text-primary-foreground' :
                  currentIdx > i ? 'bg-green-500/20 text-green-400' :
                  'bg-secondary text-muted-foreground/50'
                }`}>
                  {currentIdx > i ? (
                    <svg className="w-3 h-3" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M3 8.5l3.5 3.5 6.5-8" /></svg>
                  ) : i + 1}
                </div>
                <span className={`text-[10px] ${step === s ? 'text-foreground' : 'text-muted-foreground/40'}`}>{labels[i]}</span>
                {i < steps.length - 1 && <div className={`w-4 h-px ${currentIdx > i ? 'bg-green-500/40' : 'bg-border/20'}`} />}
              </div>
            ))}
          </div>
        )
      })()}

      {step === 'hook' && (
        <div className="space-y-4">
          <div className="p-4 rounded-lg border border-border/30 bg-secondary/20 space-y-3">
            <p className="text-sm font-medium">Install Mission Control Hook</p>
            <p className="text-xs text-muted-foreground">
              This installs a hook in <code className="text-[11px] bg-black/20 px-1 rounded">~/.hermes/hooks/mission-control/</code> that
              reports agent activity, session events, and status updates to Mission Control.
            </p>
            <div className="text-xs text-muted-foreground/60 space-y-1">
              <p>The hook will:</p>
              <ul className="list-disc list-inside pl-2 space-y-0.5">
                <li>Register Hermes agents automatically on start</li>
                <li>Report session lifecycle events</li>
                <li>Enable task dispatching from Mission Control</li>
              </ul>
            </div>
          </div>

          {hermesStatus && !hermesStatus.hookInstalled && (
            <div className="p-3 rounded-lg border border-amber-500/20 bg-amber-500/5 text-xs text-amber-400">
              Hook is not installed yet.
            </div>
          )}

          {hermesStatus?.hookInstalled && (
            <div className="p-3 rounded-lg border border-green-500/30 bg-green-500/5 text-xs text-green-400">
              Hook is already installed.
            </div>
          )}

          {error && <p className="text-xs text-red-400">{error}</p>}

          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={onClose}>Skip</Button>
            {hermesStatus?.hookInstalled ? (
              <Button size="sm" onClick={() => setStep('provider')}>Next</Button>
            ) : (
              <Button size="sm" onClick={installHook} disabled={running}>
                {running ? 'Installing...' : 'Install Hook'}
              </Button>
            )}
          </div>
        </div>
      )}

      {step === 'provider' && (
        <div className="space-y-4">
          <div>
            <p className="text-sm font-medium mb-1">Configure LLM Provider</p>
            <p className="text-xs text-muted-foreground">Hermes needs an API key to talk to an LLM. Choose your provider:</p>
          </div>

          <div className="grid grid-cols-3 gap-2">
            {([
              { id: 'anthropic', label: 'Anthropic', hint: 'Claude models', env: 'ANTHROPIC_API_KEY' },
              { id: 'openai', label: 'OpenAI', hint: 'GPT / o-series', env: 'OPENAI_API_KEY' },
              { id: 'openai_oauth', label: 'OpenAI OAuth', hint: 'Login via browser', env: '' },
              { id: 'openrouter', label: 'OpenRouter', hint: '200+ models', env: 'OPENROUTER_API_KEY' },
              { id: 'nous', label: 'Nous Portal', hint: 'Free tier', env: 'NOUS_API_KEY' },
              { id: 'google', label: 'Google AI', hint: 'Gemini models', env: 'GOOGLE_API_KEY' },
            ] as const).map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setProviderType(p.id)}
                className={`p-2.5 rounded-lg border text-left text-xs transition-colors ${
                  providerType === p.id
                    ? 'border-primary/40 bg-primary/5 text-foreground'
                    : 'border-border/20 bg-secondary/10 text-muted-foreground hover:border-border/40'
                }`}
              >
                <span className="font-medium">{p.label}</span>
                <span className="block text-[10px] text-muted-foreground/60 mt-0.5">{p.hint}</span>
              </button>
            ))}
          </div>

          {providerType === 'openai_oauth' ? (
            <div className="p-3 rounded-lg border border-border/20 bg-secondary/10 text-xs space-y-3">
              <p className="font-medium text-foreground/80">OpenAI OAuth Login</p>
              <p className="text-muted-foreground">
                Run these commands in a terminal to authenticate via browser:
              </p>
              <div className="space-y-2">
                <CopyableCommand command="hermes model openai" label="Set OpenAI as provider" />
                <CopyableCommand command="hermes setup" label="Or run full interactive setup" />
              </div>
              <p className="text-muted-foreground/50 text-[10px]">
                This opens a browser window for OAuth login. No API key needed.
                After authenticating, Hermes will save the credentials automatically.
              </p>
            </div>
          ) : (
            <div>
              <label className="text-xs text-muted-foreground block mb-1">
                API Key
              </label>
              <input
                type="password"
                value={providerKey}
                onChange={(e) => setProviderKey(e.target.value)}
                placeholder={`Enter your ${
                  providerType === 'nous' ? 'Nous Portal' :
                  providerType === 'openrouter' ? 'OpenRouter' :
                  providerType === 'google' ? 'Google AI' :
                  providerType === 'anthropic' ? 'Anthropic' : 'OpenAI'
                } API key...`}
                className="w-full h-8 rounded border border-border/40 bg-surface-1 px-2.5 text-xs text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-primary/30 font-mono"
              />
              <p className="text-[10px] text-muted-foreground/40 mt-1">
                Saved to ~/.hermes/.env — never sent to Mission Control
              </p>
            </div>
          )}

          {providerSaved && (
            <div className="p-2.5 rounded-lg border border-green-500/20 bg-green-500/5 text-xs text-green-400">
              Provider key saved successfully.
            </div>
          )}

          {error && <p className="text-xs text-red-400">{error}</p>}

          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setStep('hook')}>Back</Button>
            <Button variant="ghost" size="sm" onClick={() => setStep('identity')}>Skip</Button>
            {providerType === 'openai_oauth' ? (
              <Button size="sm" onClick={() => setStep('identity')}>Continue</Button>
            ) : (
            <Button
              size="sm"
              disabled={!providerKey.trim() || running}
              onClick={async () => {
                setRunning(true)
                setError(null)
                try {
                  const envMap: Record<string, string> = {
                    anthropic: 'ANTHROPIC_API_KEY',
                    openai: 'OPENAI_API_KEY',
                    openrouter: 'OPENROUTER_API_KEY',
                    nous: 'NOUS_API_KEY',
                    google: 'GOOGLE_API_KEY',
                  }
                  const res = await fetch('/api/hermes', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: 'set-env', key: envMap[providerType], value: providerKey }),
                  })
                  if (res.ok) {
                    setProviderSaved(true)
                    setTimeout(() => setStep('identity'), 800)
                  } else {
                    const data = await res.json().catch(() => ({}))
                    throw new Error(data.error || 'Failed to save')
                  }
                } catch (err) {
                  setError(err instanceof Error ? err.message : 'Failed to save provider key')
                } finally {
                  setRunning(false)
                }
              }}
            >
              {running ? 'Saving...' : 'Save & Continue'}
            </Button>
            )}
          </div>
        </div>
      )}

      {step === 'identity' && (
        <div className="space-y-4">
          <div>
            <p className="text-sm font-medium mb-1">Agent Identity (Optional)</p>
            <p className="text-xs text-muted-foreground">
              Customize how Hermes communicates. This is saved as <code className="text-[11px] bg-black/20 px-1 rounded">~/.hermes/SOUL.md</code>
            </p>
          </div>

          <textarea
            value={soulContent}
            onChange={(e) => setSoulContent(e.target.value)}
            placeholder="Example: You are a concise technical expert who communicates clearly and directly. You focus on actionable solutions."
            rows={4}
            className="w-full rounded border border-border/40 bg-surface-1 px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground/30 focus:outline-none focus:ring-1 focus:ring-primary/30 resize-none"
          />

          <p className="text-[10px] text-muted-foreground/40">
            Leave blank to use the default personality. You can change this anytime.
          </p>

          {error && <p className="text-xs text-red-400">{error}</p>}

          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setStep('provider')}>Back</Button>
            <Button
              size="sm"
              onClick={async () => {
                if (soulContent.trim()) {
                  try {
                    await fetch('/api/hermes', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ action: 'set-soul', content: soulContent }),
                    })
                  } catch {
                    // non-critical
                  }
                }
                setStep('gateway')
              }}
            >
              {soulContent.trim() ? 'Save & Continue' : 'Skip'}
            </Button>
          </div>
        </div>
      )}

      {step === 'gateway' && (
        <div className="space-y-4">
          <div>
            <p className="text-sm font-medium mb-1">Gateway & Channels</p>
            <p className="text-xs text-muted-foreground">
              The gateway lets you talk to Hermes from Telegram, Discord, Slack, WhatsApp, and Signal.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <StatusCard label="Gateway" ok={hermesStatus?.gatewayRunning} subtitle={hermesStatus?.gatewayRunning ? 'Running' : 'Not started'} />
            <StatusCard label="Sessions" value={hermesStatus?.activeSessions || 0} ok={true} />
          </div>

          <div className="p-3 rounded-lg border border-border/20 bg-secondary/10 text-xs space-y-2.5">
            <p className="font-medium text-foreground/80">Set up messaging channels:</p>

            <div className="space-y-2.5">
              <CopyableCommand command="hermes gateway setup" label="1. Configure a platform" />
              <CopyableCommand command="hermes gateway start" label="2. Start the gateway" />
              <p className="text-muted-foreground/70 pl-1">3. Send a message to your bot to test</p>
            </div>

            <div className="mt-2 pt-2 border-t border-border/10">
              <p className="text-muted-foreground/50 text-[10px]">
                Supported: Telegram, Discord, Slack, WhatsApp, Signal, Email.
                Each platform needs a bot token — run gateway setup for guided configuration.
              </p>
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setStep('identity')}>Back</Button>
            <Button size="sm" onClick={() => { fetchStatus(); setStep('ready') }}>
              {hermesStatus?.gatewayRunning ? 'Continue' : 'Skip for now'}
            </Button>
          </div>
        </div>
      )}

      {step === 'ready' && (
        <div className="space-y-4">
          <div className="p-5 rounded-lg border border-green-500/30 bg-green-500/5 text-center space-y-3">
            <div className="text-3xl">+</div>
            <p className="text-sm font-semibold text-green-400">Hermes is ready</p>
            <p className="text-xs text-muted-foreground">
              Hook installed{providerSaved ? ', provider configured' : ''}{soulContent.trim() ? ', identity set' : ''}.
              {hermesStatus?.cronJobCount > 0 && ` ${hermesStatus.cronJobCount} cron jobs detected.`}
            </p>
          </div>

          <div className="p-3 rounded-lg border border-border/20 bg-secondary/10 text-xs space-y-3">
            <p className="font-medium text-foreground/80">Quick commands:</p>
            <CopyableCommand command="hermes" label="Start chatting" />
            <CopyableCommand command="hermes setup" label="Full interactive setup" />
            <CopyableCommand command="hermes gateway setup" label="Set up messaging channels" />
            <CopyableCommand command="hermes gateway start" label="Start the gateway" />
          </div>

          <div className="flex justify-end">
            <Button size="sm" onClick={onComplete}>Done</Button>
          </div>
        </div>
      )}

    </div>
  )
}

function CopyableCommand({ command, label }: { command: string; label: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 bg-black/20 rounded px-2.5 py-1.5 font-mono text-[11px] flex items-center justify-between gap-2">
        <div>
          <span className="text-muted-foreground/50">$ </span>
          <span className="text-foreground/80">{command}</span>
        </div>
        <button
          type="button"
          onClick={async () => {
            await navigator.clipboard.writeText(command)
            setCopied(true)
            setTimeout(() => setCopied(false), 1500)
          }}
          className="text-[10px] px-1.5 py-0.5 rounded bg-secondary/50 text-muted-foreground hover:text-foreground transition-colors shrink-0"
        >
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <span className="text-[10px] text-muted-foreground/50 w-32 shrink-0">{label}</span>
    </div>
  )
}

function StatusCard({ label, ok, value, subtitle }: { label: string; ok?: boolean; value?: number; subtitle?: string }) {
  return (
    <div className={`p-2.5 rounded-lg border text-xs ${
      ok ? 'border-green-500/20 bg-green-500/5' : 'border-border/20 bg-secondary/10'
    }`}>
      <div className="flex items-center justify-between">
        <span className="text-muted-foreground">{label}</span>
        {value !== undefined ? (
          <span className="font-mono text-foreground">{value}</span>
        ) : (
          <span className={ok ? 'text-green-400' : 'text-muted-foreground/40'}>
            {ok ? '+' : '-'}
          </span>
        )}
      </div>
      {subtitle && <p className="text-[10px] text-muted-foreground/40 mt-0.5">{subtitle}</p>}
    </div>
  )
}
