import { Link } from 'react-router-dom'

export default function Home() {
  return (
    <div className="home">
      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">The virtual barbershop queue</p>
          <h1>Get in line.<br />Skip the crowd.</h1>
          <p className="hero-description">
            Scan your barbershop’s QR code, save a spot, and get an email when it’s nearly your turn.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link className="button primary" to="/register">Set up your shop <span aria-hidden="true">→</span></Link>
            <Link className="button secondary" to="/login">Owner login</Link>
          </div>
        </div>
        <div className="shop-sign">
          <div className="sign-stripe" aria-hidden="true" />
          <p className="eyebrow">At the shop</p>
          <h2>How to join</h2>
          <ol>
            <li><span>1</span> Scan the shop’s QR code</li>
            <li><span>2</span> Pick your service and join</li>
            <li><span>3</span> Keep your private status link</li>
          </ol>
          <div className="sign-stripe" aria-hidden="true" />
        </div>
      </section>
    </div>
  )
}
