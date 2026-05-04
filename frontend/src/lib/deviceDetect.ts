export function isMobileDevice(): boolean {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent
  if (/iphone|ipod|android|mobile|tablet/i.test(ua)) return true
  // iPadOS 13+ reports a Macintosh UA; distinguish by touch support.
  if (navigator.maxTouchPoints > 1 && /Macintosh/i.test(ua)) return true
  return false
}

// Safari-only detection (Chrome's UA also contains "Safari", so we have to
// negative-match the Chromium family).
export function isSafariBrowser(): boolean {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent
  return /Safari/i.test(ua) && !/Chrome|Chromium|Edg|OPR/i.test(ua)
}
