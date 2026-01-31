import '../App.css'

import { Link } from 'react-router-dom'

export default function OnboardingExtensionPage() {
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
            <a
              className="button secondary"
              href="https://github.com/YuWei-CH/EasyRelocate/issues"
              target="_blank"
              rel="noreferrer"
            >
              Help (GitHub Issues)
            </a>
          </div>
        </div>
      </header>

      <main className="landingMain">
        <section className="onboardingHero">
          <h1>How to use the extension</h1>
          <p className="onboardingSubtitle">
            You save listings while browsing, then compare them on a single map.
          </p>

          <div className="onboardingGrid">
            <div className="onboardingCard">
              <h2>1) Install</h2>
              <ul>
                <li>Install the EasyRelocate Chrome extension.</li>
                <li>
                  If you have trouble, open an issue on GitHub (include screenshots + the page
                  URL).
                </li>
              </ul>
            </div>

            <div className="onboardingCard">
              <h2>2) Save listings</h2>
              <ul>
                <li>
                  <strong>Airbnb / Blueground</strong>: open a listing page and click “Add to
                  Compare”.
                </li>
                <li>
                  <strong>Posts / any website</strong>: select the post text → right click →
                  “EasyRelocate: Add selected post”.
                </li>
              </ul>
            </div>

            <div className="onboardingCard">
              <h2>3) Compare</h2>
              <ul>
                <li>Set your target (workplace / school) by address or by picking on map.</li>
                <li>Filter/sort by price and distance, and optionally compute commute time.</li>
              </ul>
            </div>
          </div>
        </section>

        <section className="onboardingDisclaimer">
          <h2>Disclaimer</h2>
          <ul>
            <li>Not affiliated with Airbnb/Blueground/Google/other platforms.</li>
            <li>No server-side scraping; extraction happens in your browser.</li>
            <li>
              If you use “Add selected post”, only the text you select is sent to the backend for
              LLM-based extraction. Don’t select sensitive personal information.
            </li>
            <li>
              Locations are best-effort and may be approximate (platforms may intentionally
              obfuscate addresses).
            </li>
            <li>Always verify price/location details on the original source before deciding.</li>
          </ul>
          <div className="onboardingActions">
            <Link className="button" to="/onboarding/token">
              I understand
            </Link>
            <Link className="button secondary" to="/">
              Back
            </Link>
          </div>
        </section>
      </main>
    </div>
  )
}

