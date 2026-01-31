import '../App.css'

import { Link } from 'react-router-dom'

export default function LandingPage() {
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
            <Link className="button secondary" to="/compare">
              Start comparing
            </Link>
          </div>
        </div>
      </header>

      <main className="landingMain">
        <section className="landingHero">
          <div className="landingHeroGrid">
            <div className="landingHeroLeft">
              <div className="landingPills" aria-label="Highlights">
                <span className="pill">Chrome extension</span>
                <span className="pill">Map + list</span>
                <span className="pill">Open-source</span>
              </div>
              <h1>Relocation housing, compared in one place.</h1>
              <p>
                EasyRelocate is a non-commercial decision-support tool for interns/students
                relocating to a new city. Save listings while you browse (starting with
                Airbnb, Blueground, and selected posts via LLM), then compare them on one map with
                price + distance filters.
              </p>
              <div className="landingCtas">
                <Link className="button" to="/compare">
                  Start comparing
                </Link>
                <a
                  className="button secondary"
                  href="https://github.com/YuWei-CH/EasyRelocate/blob/main/docs/PLATFORM_ORGANIZATION.md"
                  target="_blank"
                  rel="noreferrer"
                >
                  How it works
                </a>
              </div>
              <div className="landingNote">
                Listing locations may be approximate. Verify details on the original source.
              </div>
            </div>

            <div className="landingHeroRight" aria-hidden="true">
              <div className="landingMock">
                <div className="landingMockMap">
                  <div className="landingMockPin target" style={{ left: '56%', top: '42%' }} />
                  <div className="landingMockPin listing" style={{ left: '34%', top: '34%' }} />
                  <div className="landingMockPin listing" style={{ left: '70%', top: '62%' }} />
                  <div className="landingMockPin listing" style={{ left: '46%', top: '68%' }} />
                </div>
                <div className="landingMockList">
                  <div className="landingMockItem">
                    <span className="landingMockDot listing" />
                    <span className="landingMockText">Airbnb · 1BR · $3,200/mo</span>
                    <span className="landingMockMeta">3.4 km</span>
                  </div>
                  <div className="landingMockItem">
                    <span className="landingMockDot listing" />
                    <span className="landingMockText">Blueground · Studio · $2,750/mo</span>
                    <span className="landingMockMeta">5.1 km</span>
                  </div>
                  <div className="landingMockItem">
                    <span className="landingMockDot listing" />
                    <span className="landingMockText">Airbnb · 2BR · $3,900/mo</span>
                    <span className="landingMockMeta">7.8 km</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="landingGrid" id="how">
          <div className="landingCard">
            <h2>What &amp; why</h2>
            <ul>
              <li>Compare fragmented listings faster (map + list).</li>
              <li>No booking/checkout — always links back to the source.</li>
              <li>No server-side scraping — user-side extraction only.</li>
            </ul>
          </div>

          <div className="landingCard">
            <h2>How to use</h2>
            <ol>
              <li>Run backend + frontend locally.</li>
              <li>Load the browser extension (unpacked).</li>
              <li>Set your workplace target (address or pick on map).</li>
              <li>On Airbnb/Blueground, click “Add to Compare”.</li>
              <li>
                For posts (e.g., Facebook groups), select post text and click “Add Selected Post”.
              </li>
              <li>Return here and filter/sort on the map.</li>
            </ol>
          </div>

          <div className="landingCard">
            <h2>Preliminary statements</h2>
            <ul>
              <li>Not affiliated with Airbnb/Blueground/Google/other platforms.</li>
              <li>
                Post extraction uses an LLM via OpenRouter; only the text you select is analyzed.
                Don’t select sensitive personal information.
              </li>
              <li>
                Locations are best-effort and may be approximate (platforms may
                intentionally obfuscate addresses).
              </li>
              <li>
                LLM outputs can be wrong; always verify price/location details on the original
                source before making decisions.
              </li>
              <li>
                Use at your own risk; validate details on the original platform
                before making decisions.
              </li>
            </ul>
          </div>
        </section>
      </main>

      <footer className="landingFooter">
        <div>EasyRelocate — open-source, non-commercial.</div>
        <div>
          All copyright reserved by{' '}
          <a href="https://github.com/YuWei-CH" target="_blank" rel="noreferrer">
            YuWei-CH
          </a>
        </div>
        <div>
          Welcome to contribute:{' '}
          <a
            href="https://github.com/YuWei-CH/EasyRelocate"
            target="_blank"
            rel="noreferrer"
          >
            https://github.com/YuWei-CH/EasyRelocate
          </a>
        </div>
      </footer>
    </div>
  )
}
