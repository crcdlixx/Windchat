import { useState } from 'react'

export default function Avatar({ src, name, className = 'w-8 h-8', textClassName = 'text-sm' }) {
  const [failed, setFailed] = useState(false)
  const initial = (name || '?').trim()[0]?.toUpperCase() || '?'
  const showImage = src && !failed

  return (
    <div className={`${className} rounded-full bg-wind-700 flex items-center justify-center text-wind-200 font-bold shrink-0 overflow-hidden`}>
      {showImage ? (
        <img
          src={src}
          alt={name || 'avatar'}
          className="w-full h-full object-cover"
          onError={() => setFailed(true)}
        />
      ) : (
        <span className={textClassName}>{initial}</span>
      )}
    </div>
  )
}
