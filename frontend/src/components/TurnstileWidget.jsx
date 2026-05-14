import { useEffect, useRef } from 'react'

export default function TurnstileWidget({ siteKey, onToken }) {
  const containerRef = useRef(null)
  const widgetId = useRef(null)

  useEffect(() => {
    if (!siteKey) return

    const scriptId = 'cf-turnstile-script'
    let script = document.getElementById(scriptId)

    const renderWidget = () => {
      if (!containerRef.current || !window.turnstile) return
      if (widgetId.current !== null) {
        window.turnstile.reset(widgetId.current)
        return
      }
      widgetId.current = window.turnstile.render(containerRef.current, {
        sitekey: siteKey,
        callback: (token) => onToken(token),
        'expired-callback': () => onToken(''),
        theme: 'auto',
      })
    }

    if (!script) {
      script = document.createElement('script')
      script.id = scriptId
      script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
      script.async = true
      script.onload = renderWidget
      document.head.appendChild(script)
    } else if (window.turnstile) {
      renderWidget()
    }

    return () => {
      if (widgetId.current !== null && window.turnstile) {
        window.turnstile.remove(widgetId.current)
        widgetId.current = null
      }
    }
  }, [siteKey, onToken])

  if (!siteKey) return null

  return <div ref={containerRef} className="flex justify-center my-2" />
}
