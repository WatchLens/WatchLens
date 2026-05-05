import type { Device } from '@/types'

interface Props {
  /** Device class the participant's viewport currently matches. */
  detected: Device
  /** Device class the participant's group is assigned to. */
  expected: Device
}

const DEVICE_LABEL: Record<Device, string> = {
  desktop: 'desktop',
  tablet: 'tablet',
  mobile: 'mobile (phone)',
}

/**
 * Rendered when a participant arrives on a viewport that doesn't match
 * their group's assigned device.
 *
 * Each user group is bound to a single device class — that's the
 * experimental treatment. Silently scaling a 1280px-authored UI down to
 * 375px would change the treatment in a way the researcher didn't
 * configure, so the dispatcher blocks the page and asks the participant
 * to switch devices.
 */
export default function DeviceMismatchNotice({
  detected,
  expected,
}: Props): JSX.Element {
  return (
    <div className="min-h-screen bg-white dark:bg-[#0f0f0f] flex items-center justify-center p-8">
      <div className="max-w-md text-center">
        <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-yellow-100 dark:bg-yellow-900/30 flex items-center justify-center">
          <svg
            className="w-8 h-8 text-yellow-600 dark:text-yellow-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 9v2m0 4h.01M5 19h14a2 2 0 001.84-2.75L13.74 4a2 2 0 00-3.48 0L3.16 16.25A2 2 0 005 19z"
            />
          </svg>
        </div>
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
          Please use a {DEVICE_LABEL[expected]} for this study
        </h2>
        <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
          You arrived on a <strong>{DEVICE_LABEL[detected]}</strong> browser, but
          this study is configured for <strong>{DEVICE_LABEL[expected]}</strong>{' '}
          users. Open the study link on a {DEVICE_LABEL[expected]} device to
          continue.
        </p>
      </div>
    </div>
  )
}
