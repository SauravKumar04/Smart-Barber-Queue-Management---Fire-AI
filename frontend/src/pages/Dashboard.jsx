import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { ErrorNotice, Loading, Metrics } from '../components/Layout.jsx'
import { api, copyLink, POLL_INTERVAL, useResource } from '../services/api.js'
import { OwnerGate } from './Auth.jsx'

export default function Dashboard() {
  const session = useResource('/auth/me')
  return <OwnerGate session={session}><OwnerDashboard /></OwnerGate>
}

function OwnerDashboard() {
  const navigate = useNavigate()
  const dashboard = useResource('/owner/dashboard', POLL_INTERVAL)
  const fieldwork = useResource(dashboard.data?.shop ? '/owner/fieldwork' : null)
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState()
  const [message, setMessage] = useState('')
  const [showLink, setShowLink] = useState(false)

  async function mutate(path, options, success, onSuccess) {
    setBusy(path)
    setError(null)
    setMessage('')
    try {
      await api(path, options)
      onSuccess?.()
      setMessage(success)
      if (path !== '/auth/logout') await dashboard.refresh()
    } catch (failure) {
      setError(failure)
      void dashboard.refresh()
    } finally {
      setBusy('')
    }
  }

  if (dashboard.loading) return <Loading>Loading your queue…</Loading>
  if (dashboard.error?.status === 401) return <Navigate to="/login" replace />
  if (!dashboard.data) return <ErrorNotice error={dashboard.error} retry={dashboard.refresh} />

  const { shop, waiting, serving, link, timeZone, stats } = dashboard.data
  const minutes = value => value === null ? null : `${value} min`
  const logout = () => mutate('/auth/logout', { method: 'POST' }, '', () => navigate('/login', { replace: true }))

  function act(entry, action) {
    if (action === 'cancel' && !window.confirm(`Cancel token #${entry.token} for ${entry.name}?`)) return
    const messages = { start: 'Service started.', complete: 'Service marked completed.', cancel: 'Queue entry cancelled.' }
    void mutate(`/owner/queue/${entry._id}/${action}`, { method: 'POST' }, messages[action])
  }

  return (
    <div className="dashboard">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Owner portal</p>
          <h1>{shop?.name || 'Set up your shop'}</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          {shop && <button className="button secondary" disabled={Boolean(busy)} aria-expanded={editing}
            onClick={() => { setEditing(!editing); setError(null); setMessage('') }}>
            {editing ? 'Close settings' : 'Shop settings'}
          </button>}
          <button className="button secondary" onClick={logout} disabled={Boolean(busy)}>Log out</button>
        </div>
      </div>
      <ErrorNotice error={dashboard.error} retry={dashboard.refresh} />
      <ErrorNotice error={error} />
      {message && <p className="notice" role="status">{message}</p>}

      {!shop ? (
        <ShopForm busy={busy} onSave={body => mutate('/owner/shop', { method: 'POST', body }, 'Shop created.')} />
      ) : <>
        {editing && <ShopForm key={shop.id} shop={shop} busy={busy} onSave={body =>
          mutate('/owner/shop', { method: 'PUT', body }, 'Shop settings saved.', () => setEditing(false))
        } />}
        <section className="panel live-summary" aria-labelledby="summary">
          <div className="section-heading">
            <div><p className="eyebrow">Live queue</p><h2 id="summary">Today at a glance</h2></div>
            <span className="state-label"><span aria-hidden="true" />Updates every 12s</span>
          </div>
          <Metrics items={[
            ['Waiting now', waiting.length], ['Chairs in use', `${serving.length} / ${shop.chairs}`],
            ['Completed today', stats.completedToday], ['Avg. wait today', minutes(stats.averageWaitingMinutes)],
            ['Avg. service today', minutes(stats.averageServiceMinutes)],
          ]} />
        </section>
        <div className="dashboard-grid">
          <div className="dashboard-stack">
            <QueueList title="In service" entries={serving} act={act} busy={busy} timeZone={timeZone}
              empty="No services are in progress." />
            <QueueList title="Waiting line" entries={waiting} act={act} busy={busy} timeZone={timeZone}
              canStart={serving.length < shop.chairs} empty="New customers will appear here when they join." />
          </div>
          <aside className="dashboard-stack">
            <section className="panel qr-panel">
              <h2>Shop QR code</h2>
              <p className="muted text-sm">Print it and place it where customers can scan to join.</p>
              <div className="qr-preview">
                <img src="/api/owner/shop/qr" width="176" height="176" alt={`Queue QR code for ${shop.name}`} />
              </div>
              <a href="/api/owner/shop/qr?download=1" className="button primary" download>Download QR code</a>
              <div className="qr-links">
                <a className="text-button" href={link} target="_blank" rel="noreferrer">Open join page ↗</a>
                <button className="text-button" onClick={async () => {
                  const copied = await copyLink(link)
                  setShowLink(!copied)
                  setMessage(copied ? 'Shop link copied.' : '')
                }}>Copy shop link</button>
              </div>
              {showLink && <label className="private-link">Shop link
                <input readOnly value={link} onFocus={event => event.currentTarget.select()} />
              </label>}
            </section>
            <section className="panel fieldwork-panel">
              <p className="eyebrow">Recorded fieldwork</p>
              <h2>Observed shop timings</h2>
              {fieldwork.loading && <p className="muted" role="status">Loading observations…</p>}
              <ErrorNotice error={fieldwork.error} retry={fieldwork.refresh} />
              {fieldwork.data && (fieldwork.data.count > 0 ? <>
                <Metrics items={[
                  ['Avg. observed wait', minutes(fieldwork.data.averageWaitingMinutes)],
                  ['Avg. observed service', minutes(fieldwork.data.averageServiceMinutes)],
                ]} />
                <p className="muted text-sm">
                  Based on {fieldwork.data.count} recorded {fieldwork.data.count === 1 ? 'visit' : 'visits'}.
                  {fieldwork.data.approximateCount > 0 && ' Includes approximate arrival times.'}
                </p>
              </> : <p className="muted">The fieldwork file has no complete timing observations.</p>)}
            </section>
          </aside>
        </div>
      </>}
    </div>
  )
}

function QueueList({ title, entries, act, busy, timeZone, canStart, empty }) {
  const formatter = new Intl.DateTimeFormat(undefined, { timeZone, hour: 'numeric', minute: 'numeric' })
  return (
    <section className="panel queue-panel">
      <div className="queue-panel-heading"><h2>{title}</h2></div>
      {entries.length ? <ol className="queue-list">
        {entries.map((entry, index) => (
          <li key={entry._id}>
            <span className="token-chip">#{entry.token}</span>
            <div className="entry-detail">
              <strong>{entry.name}</strong>
              <span>{entry.serviceName} · Joined {formatter.format(new Date(entry.joinedAt))}</span>
            </div>
            <div className="row-actions">
              {entry.status === 'serving'
                ? <button className="button primary small" disabled={Boolean(busy)} onClick={() => act(entry, 'complete')}>Mark completed</button>
                : index === 0 && <button className="button primary small" disabled={!canStart || Boolean(busy)}
                  title={canStart ? undefined : 'All chairs are in use'} onClick={() => act(entry, 'start')}>Start service</button>}
              <button className="text-button danger-text" disabled={Boolean(busy)} onClick={() => act(entry, 'cancel')}>Cancel</button>
            </div>
          </li>
        ))}
      </ol> : <p className="empty">{empty}</p>}
    </section>
  )
}

function ShopForm({ shop, busy, onSave }) {
  const [services, setServices] = useState(() => shop?.services.map(service => ({ ...service, key: service.id })) || [])
  const [nextKey, setNextKey] = useState(1)

  function submit(event) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const body = { name: data.get('name'), chairs: Number(data.get('chairs')) }
    if (shop) body.services = services.map(({ id, name, minutes }) => ({ id, name, minutes: Number(minutes) }))
    void onSave(body)
  }

  function update(index, values) {
    setServices(current => current.map((service, i) => i === index ? { ...service, ...values } : service))
  }

  return (
    <section className={shop ? 'panel' : 'panel narrow create-shop'}>
      <h2>{shop ? 'Shop settings' : 'Shop details'}</h2>
      <form className="form" onSubmit={submit}>
        <fieldset disabled={Boolean(busy)} className="form">
          <div className="settings-fields">
            <label>Shop name <input name="name" defaultValue={shop?.name} maxLength={80} required /></label>
            <label>Active barber chairs <input name="chairs" type="number" min={1} max={20}
              defaultValue={shop?.chairs ?? 1} required /></label>
          </div>
          {shop && <>
            <div>
              <h3>Services</h3>
              <p className="muted text-sm">Service changes apply to new queue entries.</p>
            </div>
            {services.map((service, index) => (
              <div className="service-fields" key={service.key}>
                <label>Service name <input value={service.name} maxLength={60} required
                  onChange={event => update(index, { name: event.target.value })} /></label>
                <label>Minutes <input type="number" min={1} max={240} value={service.minutes} required
                  onChange={event => update(index, { minutes: event.target.value })} /></label>
                <button className="text-button danger-text" type="button" disabled={services.length === 1}
                  onClick={() => setServices(current => current.filter((_, i) => i !== index))}>Remove</button>
              </div>
            ))}
            <button className="button secondary" type="button" disabled={services.length >= 12} onClick={() => {
              setServices([...services, { key: `new-${nextKey}`, name: '', minutes: 20 }])
              setNextKey(nextKey + 1)
            }}>Add service</button>
          </>}
          <button className="button primary">{busy ? 'Saving…' : shop ? 'Save settings' : 'Create shop'}</button>
        </fieldset>
      </form>
    </section>
  )
}
