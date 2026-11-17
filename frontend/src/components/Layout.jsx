import { Link, Outlet } from 'react-router-dom'

export default function Layout() {
  return (
    <div className="site">
      <header className="site-header">
        <div className="shell flex items-center justify-between gap-4">
          <Link to="/" className="brand" aria-label="QueueLess home">
            <span className="brand-icon" aria-hidden="true">✂</span>QueueLess
          </Link>
          <Link to="/owner" className="header-link">Owner portal <span aria-hidden="true">↗</span></Link>
        </div>
      </header>
      <main className="shell main-content"><Outlet /></main>
      <footer className="site-footer">
        <div className="shell flex items-center justify-between gap-3">
          <span className="font-bold">QueueLess</span><span>Virtual queues for local barbershops</span>
        </div>
      </footer>
    </div>
  )
}

export function ErrorNotice({ error, retry }) {
  if (!error) return null
  return (
    <div className="notice notice-error" role="alert">
      <span>{error.message}</span>
      {retry && <button className="text-button" onClick={retry}>Try again</button>}
    </div>
  )
}

export function Loading({ children = 'Loading…' }) {
  return <p role="status" className="muted panel">{children}</p>
}

export function Metrics({ items }) {
  return (
    <dl className="metrics">
      {items.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value ?? '—'}</dd>
        </div>
      ))}
    </dl>
  )
}
