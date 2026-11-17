import { useCallback, useEffect, useRef, useState } from 'react'

export async function api(path, { method = 'GET', body, signal } = {}) {
  let response
  try {
    response = await fetch('/api' + path, {
      method, signal,
      ...(body !== undefined && {
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }),
    })
  } catch (error) {
    if (error.name === 'AbortError') throw error
    throw new Error('Could not connect. Check your connection and try again.')
  }

  if (response.status === 204) return null
  const data = await response.json().catch(() => null)
  if (!response.ok || !data) {
    throw Object.assign(new Error(data?.message || 'The server is unavailable. Try again in a moment.'), {
      status: response.status,
    })
  }
  return data
}

export function useResource(path, interval = 0) {
  const [result, setResult] = useState({})
  const request = useRef(null)
  const refresh = useCallback(async () => {
    if (!path) return
    request.current?.abort()
    const controller = new AbortController()
    request.current = controller
    try {
      const data = await api(path, { signal: controller.signal })
      if (!controller.signal.aborted) setResult({ path, data })
    } catch (error) {
      if (controller.signal.aborted) return
      setResult(previous => ({
        path, error, data: previous.path === path && ![401, 404, 410].includes(error.status)
          ? previous.data : undefined,
      }))
    }
  }, [path])

  useEffect(() => {
    if (!path) return
    void refresh()
    const timer = interval ? setInterval(refresh, interval) : undefined
    return () => {
      clearInterval(timer)
      request.current?.abort()
    }
  }, [path, interval, refresh])

  const current = result.path === path ? result : {}
  return { ...current, loading: Boolean(path) && !current.data && !current.error, refresh }
}

export const POLL_INTERVAL = 12000

export async function copyLink(link) {
  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(link)
      return true
    } catch {
      // The address remains selectable when clipboard access is unavailable.
    }
  }
  return false
}
