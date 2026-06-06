import { useEffect, useState } from 'react'
import { createIdenticonDataUrl } from '../lib/identicon'

export default function Avatar({ src, name, className = 'w-8 h-8' }) {
  const [failed, setFailed] = useState(false)
  const showImage = src && !failed
  const alt = name || 'avatar'

  useEffect(() => {
    setFailed(false)
  }, [src])

  return (
    <div className={`${className} rounded-full bg-wind-700 shrink-0 overflow-hidden`}>
      <img
        src={showImage ? src : createIdenticonDataUrl(name)}
        alt={alt}
        className="w-full h-full object-cover"
        onError={() => setFailed(true)}
      />
    </div>
  )
}
