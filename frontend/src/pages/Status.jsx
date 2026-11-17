import { useState } from 'react'
import { useLocation, useParams } from 'react-router-dom'
import { ErrorNotice, Loading, Metrics } from '../components/Layout.jsx'
import { api, copyLink, POLL_INTERVAL, useResource } from '../services/api.js'

const statusText = {
  waiting: ['You’re in the queue', 'Keep this page open or save your private link to check your place later.'],
  serving: ['It’s your turn', 'Your barber has started your service.'],
  completed: ['Service completed', 'Thanks for visiting.'],
  cancelled: ['Your spot was cancelled', 'Scan the shop’s QR code again if you’d like to rejoin.'],
}

export default function Status() {
  const { key } = useParams()
  const { state } = useLocation()
  return <CustomerStatus key={key} statusKey={key} joined={state?.joined} />
}

function CustomerStatus({ statusKey, joined }) {
  const path = `/status/${encodeURIComponent(statusKey)}`
  const resource = useResource(path, POLL_INTERVAL)
  const [busy, setBusy] = useState(false)
  const [confirm, setConfirm] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState()

  async function cancel() {
    setBusy(true)
    setError(null)
    try {
      await api(path + '/cancel', { method: 'POST' })
      setConfirm(false)
    } catch (failure) {
      setError(failure)
    } finally {
      await resource.refresh()
      setBusy(false)
    }
  }

  if (resource.loading) return <Loading>Checking your place…</Loading>
  const data = resource.data
  if (!data) {
    return (
      <section className="narrow panel customer-card">
        <h1>Queue status</h1>
        <ErrorNotice error={resource.error} retry={[404, 410].includes(resource.error?.status) ? null : resource.refresh} />
      </section>
    )
  }

  const [heading, detail] = statusText[data.status]
  return (
    <section className="narrow panel customer-card">
      <p className="eyebrow">{data.shopName}</p>
      <h1>{heading}</h1>
      <div className="ticket">
        <div><span>Your token</span><strong>#{data.token}</strong></div>
        <span className="ticket-service">{data.service}</span>
      </div>
      <p className="muted">{detail}</p>
      {joined && data.status === 'waiting' && <p className="notice" role="status">You joined successfully.</p>}
      <ErrorNotice error={resource.error} retry={resource.refresh} />
      <ErrorNotice error={error} />
      {data.status === 'waiting' && <>
        <Metrics items={[
          ['Queue position', data.position], ['Waiting ahead', data.ahead],
          ['Estimated wait', `${data.estimatedWaitMinutes} min`],
        ]} />
        <p className="muted text-sm">Waiting time is approximate. This page updates every 12 seconds.</p>
      </>}
      <div className="status-link-block">
        <label className="private-link">Private status link
          <input readOnly value={window.location.href} onFocus={event => event.currentTarget.select()} />
        </label>
        <button className="button secondary" onClick={async () => {
          setMessage(await copyLink(window.location.href) ? 'Link copied.' : 'Select and copy the link above.')
        }}>Copy status link</button>
        {message && <p className="muted text-sm" role="status">{message}</p>}
      </div>
      {data.status === 'waiting' && <div className="cancel-area">
        {confirm ? <>
          <p>Leave the queue and give up your spot?</p>
          <div className="flex flex-wrap gap-2">
            <button className="button danger" onClick={cancel} disabled={busy}>{busy ? 'Leaving…' : 'Yes, leave queue'}</button>
            <button className="button secondary" onClick={() => setConfirm(false)} disabled={busy}>Keep my spot</button>
          </div>
        </> : <button className="text-button danger-text" onClick={() => setConfirm(true)}>Leave the queue</button>}
      </div>}
    </section>
  )
}
