import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ErrorNotice, Loading, Metrics } from '../components/Layout.jsx'
import { api, POLL_INTERVAL, useResource } from '../services/api.js'

export default function Join() {
  const { shopId } = useParams()
  return <JoinForm key={shopId} shopId={shopId} />
}

function JoinForm({ shopId }) {
  const path = `/shops/${encodeURIComponent(shopId)}/queue`
  const resource = useResource(path, POLL_INTERVAL)
  const navigate = useNavigate()
  const [serviceId, setServiceId] = useState('')
  const [error, setError] = useState()
  const [busy, setBusy] = useState(false)

  async function submit(event) {
    event.preventDefault()
    const body = Object.fromEntries(new FormData(event.currentTarget))
    setBusy(true)
    setError(null)
    try {
      const entry = await api(path, { method: 'POST', body })
      navigate(entry.statusPath, { replace: true, state: { joined: true } })
    } catch (failure) {
      setError(failure)
      setBusy(false)
      void resource.refresh()
    }
  }

  if (resource.loading) return <Loading>Loading the shop queue…</Loading>
  const data = resource.data
  if (!data) return <ErrorNotice error={resource.error} retry={resource.error?.status === 404 ? null : resource.refresh} />
  const selectedService = data.shop.services.some(service => service.id === serviceId) ? serviceId : ''

  return (
    <section className="narrow panel customer-card">
      <p className="eyebrow">Join the queue</p>
      <h1>{data.shop.name}</h1>
      <Metrics items={[
        ['Waiting', data.waitingCount], ['In service', data.servingCount],
        ['Estimated wait', `${data.estimatedWaitMinutes} min`],
      ]} />
      <p className="muted text-sm">Your wait may change as the queue moves.</p>
      <ErrorNotice error={resource.error} retry={resource.refresh} />
      <ErrorNotice error={error} />
      <form className="form" onSubmit={submit}>
        <label>Your name <input name="name" autoComplete="name" maxLength={80} required /></label>
        <label>Email <input name="email" type="email" autoComplete="email" maxLength={254} required />
          <small>We’ll email your private status link and let you know when your turn is close.</small>
        </label>
        <label>Service <select name="serviceId" required value={selectedService} onChange={event => setServiceId(event.target.value)}>
          <option value="">Choose a service</option>
          {data.shop.services.map(service => (
            <option key={service.id} value={service.id}>{service.name} · about {service.minutes} min</option>
          ))}
        </select></label>
        <button className="button primary" disabled={busy}>{busy ? 'Joining…' : 'Join the queue'}</button>
      </form>
    </section>
  )
}
