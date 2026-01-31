import '../App.css'

import { useEffect, useMemo, useState } from 'react'
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

  const token = issued?.workspace_token ?? ''
  const expiresAt = issued?.expires_at ?? ''

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
            This token is valid for 30 days. Keep it private (like a password).
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
                  <button className="button" onClick={onContinue}>
                    Continue to map
                  </button>
                </div>
              </>
            ) : null}

            {!loading && !issued && !error ? (
              <div className="onboardingActions">
                <button className="button secondary" onClick={() => void doIssue()}>
                  Generate token
                </button>
                <button className="button" onClick={onContinue}>
                  Continue to map
                </button>
              </div>
            ) : null}
          </div>
        </section>
      </main>
    </div>
  )
}
