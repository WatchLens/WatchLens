import { useEffect, useState } from 'react'
import type { Device } from '@/types'

/**
 * Detect the participant's current device class using Tailwind-standard
 * breakpoints. Tracks `window.innerWidth` so resizes / orientation
 * changes flip the dispatcher to the matching template at render time.
 *
 *   width <  768px → 'mobile'
 *   width <  1024px → 'tablet'
 *   width >= 1024px → 'desktop'
 *
 * The dispatcher in `pages/user/Feed.tsx` / `VideoWatch.tsx` reads this
 * to pick the right slot in `ui_config.{feed,watch}.{desktop,tablet,mobile}`.
 * If the slot is unconfigured, the participant sees a notice page —
 * never a desktop UI scaled into a phone-sized box.
 */
export function useDevice(): Device {
  const [device, setDevice] = useState<Device>(() => detect())

  useEffect(() => {
    if (typeof window === 'undefined') return
    const handler = () => {
      const next = detect()
      setDevice((prev) => (prev === next ? prev : next))
    }
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  }, [])

  return device
}

function detect(): Device {
  if (typeof window === 'undefined') return 'desktop'
  const w = window.innerWidth
  if (w < 768) return 'mobile'
  if (w < 1024) return 'tablet'
  return 'desktop'
}
