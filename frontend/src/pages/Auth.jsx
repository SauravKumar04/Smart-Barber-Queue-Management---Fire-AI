import { useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { api } from '../services/api.js'
import { ErrorNotice, Loading } from '../components/Layout.jsx'

export default function Auth({ register = false }) {
  const navigate = useNavigate()
  const [error, setError] = useState()
  const [busy, setBusy] = useState(false)

  async function submit(event) {
    event.preventDefault()
    const body = Object.fromEntries(new FormData(event.currentTarget))
    setBusy(true)
    setError(null)
    try {
      await api(register ? '/auth/register' : '/auth/login', { method: 'POST', body })
      navigate('/owner', { replace: true })
    } catch (failure) {
      setError(failure)
      setBusy(false)
    }
  }

  return (
    <section className="narrow panel customer-card">
      <p className="eyebrow">Shop owner portal</p>
      <h1>{register ? 'Create your account' : 'Log in to your shop'}</h1>
      <ErrorNotice error={error} />
      <form className="form" onSubmit={submit}>
        <label>Email <input name="email" type="email" autoComplete="email" maxLength={254} required /></label>
        <label>Password <input name="password" type="password"
          autoComplete={register ? 'new-password' : 'current-password'} minLength={8} maxLength={72} required />
          {register && <small>Use at least 8 characters.</small>}
        </label>
        <button className="button primary" disabled={busy}>
          {busy ? 'Please wait…' : register ? 'Create account' : 'Log in'}
        </button>
      </form>
      <p className="form-note">
        {register ? 'Already have an account? ' : 'New to QueueLess? '}
        <Link to={register ? '/login' : '/register'}>{register ? 'Log in' : 'Create an owner account'}</Link>
      </p>
    </section>
  )
}

export function OwnerGate({ session, children }) {
  if (session.loading) return <Loading>Opening your owner portal…</Loading>
  if (session.error?.status === 401) return <Navigate to="/login" replace />
  if (session.error) return <ErrorNotice error={session.error} retry={session.refresh} />
  return children
}
