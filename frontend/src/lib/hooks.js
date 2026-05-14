import { useEffect, useRef } from 'react'

// 点击指定元素外部时触发回调
export function useClickOutside(callback) {
  const ref = useRef(null)
  useEffect(() => {
    function handler(e) {
      if (ref.current && !ref.current.contains(e.target)) {
        callback()
      }
    }
    document.addEventListener('mousedown', handler)
    document.addEventListener('touchstart', handler)
    return () => {
      document.removeEventListener('mousedown', handler)
      document.removeEventListener('touchstart', handler)
    }
  }, [callback])
  return ref
}

// 检测是否移动端（宽度 < 768px）
export function useIsMobile() {
  const mq = window.matchMedia('(max-width: 767px)')
  return mq.matches
}
