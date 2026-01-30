import '../App.css'

import { Link } from 'react-router-dom'

export default function LandingPage() {
  return (
    <div className="landing">
      <header className="landingHeader">
        <div className="landingBrand">EasyRelocate</div>
        <div className="actions">
          <Link className="button" to="/compare">
            Open app
          </Link>
        </div>
      </header>

      <main className="landingMain">
        <section className="landingHero">
          <h1>Relocation housing, compared in one place.</h1>
          <p>
            EasyRelocate is an open-source, non-commercial decision-support tool
            for interns/students relocating to a new city. Save listings while
            you browse (starting with Airbnb), then compare them on a single map
            with price + distance filters.
          </p>
          <div className="landingCtas">
            <Link className="button" to="/compare">
              Start comparing
            </Link>
          </div>
          <div className="landingNote">
            MVP is US-only for now. Listing locations may be approximate.
          </div>
        </section>

        <section className="landingGrid">
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
              <li>On Airbnb, click “Add to Compare”.</li>
              <li>Return here and filter/sort on the map.</li>
            </ol>
          </div>

          <div className="landingCard">
            <h2>Preliminary statements</h2>
            <ul>
              <li>Not affiliated with Airbnb/Google/other platforms.</li>
              <li>
                Locations are best-effort and may be approximate (platforms may
                intentionally obfuscate addresses).
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
      </footer>
    </div>
  )
}
