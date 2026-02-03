import '../App.css'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import { issueWorkspaceToken, type WorkspaceIssue } from '../api'

// React StrictMode mounts/unmounts components twice in dev. If we start a request during the first
// mount and then unmount before it resolves, we can accidentally "skip" issuance on the second
// mount. Share a single in-flight promise across mounts to avoid both double-issuing and skipping.
let inFlightIssue: Promise<WorkspaceIssue> | null = null

function issueWorkspaceTokenOnce(): Promise<WorkspaceIssue> {
  if (!inFlightIssue) {
    inFlightIssue = issueWorkspaceToken().catch((e) => {
      inFlightIssue = null
      throw e
    })
  }
  return inFlightIssue
}

function formatExpires(expiresAtIso: string): string {
  const d = new Date(expiresAtIso)
  if (Number.isNaN(d.getTime())) return expiresAtIso
  return d.toLocaleString()
}

export default function OnboardingTokenPage() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [issued, setIssued] = useState<WorkspaceIssue | null>(null)
  const [pairStatus, setPairStatus] = useState<string | null>(null)
  const [extensionStatus, setExtensionStatus] = useState<string | null>(null)
  const pairTimeoutRef = useRef<number | null>(null)
  const pingTimeoutRef = useRef<number | null>(null)

  const token = issued?.workspace_token ?? ''
  const expiresAt = issued?.expires_at ?? ''
  const savedToken = useMemo(() => {
    const raw = localStorage.getItem('easyrelocate_workspace_token')
    return (raw ?? '').trim()
  }, [issued])
  const effectiveToken = token || savedToken

  const alreadyHasToken = useMemo(() => {
    const raw = localStorage.getItem('easyrelocate_workspace_token')
    return (raw ?? '').trim().length > 0
  }, [])

  const doIssue = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await issueWorkspaceTokenOnce()
      setIssued(res)
      localStorage.setItem('easyrelocate_workspace_token', res.workspace_token)
      localStorage.setItem('easyrelocate_workspace_expires_at', res.expires_at)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    let cancelled = false
    if (alreadyHasToken) {
      setLoading(false)
      return
    }
    void (async () => {
      try {
        const res = await issueWorkspaceTokenOnce()
        // Even if this component instance unmounted (StrictMode), persist the token so a
        // subsequent mount can see it.
        localStorage.setItem('easyrelocate_workspace_token', res.workspace_token)
        localStorage.setItem('easyrelocate_workspace_expires_at', res.expires_at)

        if (cancelled) return
        setIssued(res)
      } catch (e) {
        if (cancelled) return
        setError(e instanceof Error ? e.message : String(e))
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [alreadyHasToken])

  const onCopy = async () => {
    if (!token) return
    try {
      await navigator.clipboard.writeText(token)
    } catch {
      // ignore; user can manually copy
    }
  }

  const onContinue = () => {
    navigate('/compare')
  }

  const onPairExtension = () => {
    const t = effectiveToken.trim()
    if (!t) {
      setPairStatus('Missing token to pair.')
      return
    }
    setPairStatus('Waiting for extension…')
    if (pairTimeoutRef.current) {
      window.clearTimeout(pairTimeoutRef.current)
    }
    pairTimeoutRef.current = window.setTimeout(() => {
      setPairStatus('No response from extension. Make sure it is installed and enabled.')
    }, 3000)
    window.postMessage({ type: 'EASYRELOCATE_PAIR_REQUEST', token: t }, window.location.origin)
  }

  const waitForPairResult = (): Promise<boolean> =>
    new Promise((resolve) => {
      const timeout = window.setTimeout(() => {
        window.removeEventListener('message', onResult)
        resolve(false)
      }, 3500)
      const onResult = (event: MessageEvent) => {
        if (event.source !== window) return
        if (event.origin !== window.location.origin) return
        const data = event.data as { type?: string; ok?: boolean } | null
        if (!data || data.type !== 'EASYRELOCATE_PAIR_RESULT') return
        window.clearTimeout(timeout)
        window.removeEventListener('message', onResult)
        resolve(!!data.ok)
      }
      window.addEventListener('message', onResult)
    })

  const onPairAndContinue = async () => {
    onPairExtension()
    const ok = await waitForPairResult()
    if (!ok) return
    navigate('/compare')
  }

  useEffect(() => {
    const handler = (event: MessageEvent) => {
      if (event.source !== window) return
      if (event.origin !== window.location.origin) return
      const data = event.data as { type?: string; ok?: boolean; error?: string } | null
      if (data?.type === 'EASYRELOCATE_PING_RESULT') {
        if (pingTimeoutRef.current) {
          window.clearTimeout(pingTimeoutRef.current)
          pingTimeoutRef.current = null
        }
        setExtensionStatus('Extension detected.')
        return
      }
      if (!data || data.type !== 'EASYRELOCATE_PAIR_RESULT') return
      if (pairTimeoutRef.current) {
        window.clearTimeout(pairTimeoutRef.current)
        pairTimeoutRef.current = null
      }
      if (data.ok) {
        setPairStatus('Extension paired successfully.')
      } else {
        setPairStatus(data.error || 'Failed to pair with extension.')
      }
    }
    window.addEventListener('message', handler)
    pingTimeoutRef.current = window.setTimeout(() => {
      setExtensionStatus('Extension not detected. Install or reload it, then refresh this page.')
    }, 1200)
    window.postMessage({ type: 'EASYRELOCATE_PING_REQUEST' }, window.location.origin)
    return () => {
      window.removeEventListener('message', handler)
      if (pairTimeoutRef.current) {
        window.clearTimeout(pairTimeoutRef.current)
        pairTimeoutRef.current = null
      }
      if (pingTimeoutRef.current) {
        window.clearTimeout(pingTimeoutRef.current)
        pingTimeoutRef.current = null
      }
    }
  }, [])

  return (
    <div className="landing">
      <header className="landingHeader">
        <div className="landingHeaderInner">
          <Link className="landingBrandButton" to="/">
            <img
              className="landingBrandLogo"
              src="/easyrelocate-logo.svg"
              alt=""
              aria-hidden="true"
            />
            EasyRelocate
          </Link>
          <div className="landingHeaderActions">
            <Link className="button secondary" to="/onboarding/extension">
              Help
            </Link>
            <a
              className="button secondary"
              href="https://github.com/YuWei-CH/EasyRelocate/issues"
              target="_blank"
              rel="noreferrer"
            >
              GitHub Issues
            </a>
          </div>
        </div>
      </header>

      <main className="landingMain">
        <section className="onboardingHero">
          <h1>Workspace token</h1>
          <p className="onboardingSubtitle">
            This token is valid for 6 months. Keep it private (like a password).
          </p>
          <p className="onboardingSubtitle" style={{ marginTop: 6 }}>
            You can update your token anytime in the Map page (Workspace panel). Saving a new token
            will auto‑pair your extension.
          </p>

          <div className="onboardingCard" style={{ maxWidth: 720 }}>
            {loading ? (
              <div style={{ color: '#475569', fontSize: 13 }}>Issuing token…</div>
            ) : null}

            {!loading && alreadyHasToken ? (
              <div style={{ color: '#475569', fontSize: 13 }}>
                This browser already has a workspace token saved. You can continue to the map.
              </div>
            ) : null}

            {!loading && error ? (
              <div className="error">
                Failed to issue a token. If you are self-hosting, make sure the backend enables
                public token issuance. Otherwise, open a GitHub issue for help.
                {'\n\n'}
                {error}
                {'\n\n'}
                <button
                  className="button secondary"
                  style={{ marginTop: 10 }}
                  onClick={() => void doIssue()}
                >
                  Retry token generation
                </button>
              </div>
            ) : null}

            {!loading && issued ? (
              <>
                <div className="tokenBox">
                  <div className="tokenLabel">Your token</div>
                  <div className="tokenValue" title="Click Copy to copy">
                    {token}
                  </div>
                  <div className="tokenMeta">Expires: {formatExpires(expiresAt)}</div>
                </div>
                <div className="onboardingActions">
                  <button className="button secondary" onClick={() => void onCopy()}>
                    Copy
                  </button>
                  <button className="button secondary" onClick={onContinue}>
                    Continue to map
                  </button>
                  <button className="button" onClick={onPairAndContinue}>
                    Pair & Continue
                  </button>
                </div>
              </>
            ) : null}

            {!loading && !issued && !error ? (
              <div className="onboardingActions">
                <button className="button secondary" onClick={() => void doIssue()}>
                  Generate token
                </button>
                <button className="button secondary" onClick={onContinue}>
                  Continue to map
                </button>
                <button className="button" onClick={onPairAndContinue}>
                  Pair & Continue
                </button>
              </div>
            ) : null}

            {pairStatus ? (
              <div style={{ marginTop: 12, color: '#475569', fontSize: 13 }}>{pairStatus}</div>
            ) : null}
            {extensionStatus ? (
              <div style={{ marginTop: 6, color: '#475569', fontSize: 13 }}>
                {extensionStatus}
              </div>
            ) : null}
          </div>
        </section>
      </main>
    </div>
  )
}
