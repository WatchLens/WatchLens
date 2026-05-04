import { ReactNode } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'

interface NavItem {
  id: string
  label: string
  path: string
  icon: ReactNode
  iconFilled?: ReactNode
}

const navItems: NavItem[] = [
  {
    id: 'home',
    label: 'Home',
    path: '/',
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
        />
      </svg>
    ),
    iconFilled: (
      <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
        <path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z" />
      </svg>
    ),
  },
  {
    id: 'trending',
    label: 'Trending',
    path: '/?sort=popular',
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M17.657 18.657A8 8 0 016.343 7.343S7 9 9 10c0-2 .5-5 2.986-7C14 5 16.09 5.777 17.656 7.343A7.975 7.975 0 0120 13a7.975 7.975 0 01-2.343 5.657z"
        />
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M9.879 16.121A3 3 0 1012.015 11L11 14H9c0 .768.293 1.536.879 2.121z"
        />
      </svg>
    ),
  },
]

interface SidebarProps {
  isOpen: boolean
  isCollapsed: boolean
  onClose?: () => void
}

export default function Sidebar({
  isOpen,
  isCollapsed,
  onClose,
}: SidebarProps): JSX.Element | null {
  const navigate = useNavigate()
  const location = useLocation()

  const handleNavClick = (path: string): void => {
    navigate(path)
    if (isOpen && window.innerWidth < 1024) {
      onClose?.()
    }
  }

  // Mobile overlay
  if (isOpen && window.innerWidth < 1024) {
    return (
      <>
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={onClose}
        />
        <aside className="fixed top-14 left-0 bottom-0 w-64 bg-white dark:bg-[#0f0f0f] z-50 overflow-y-auto">
          <nav className="py-3">
            {navItems.map((item) => {
              const isActive =
                location.pathname === item.path ||
                (item.path === '/' && location.pathname === '/')
              return (
                <button
                  key={item.id}
                  onClick={() => handleNavClick(item.path)}
                  className={`w-full flex items-center gap-6 px-6 py-2.5 hover:bg-gray-100 dark:hover:bg-gray-800 ${
                    isActive ? 'bg-gray-100 dark:bg-gray-800' : ''
                  }`}
                >
                  <span
                    className={
                      isActive
                        ? 'text-gray-900 dark:text-white'
                        : 'text-gray-600 dark:text-gray-400'
                    }
                  >
                    {isActive && item.iconFilled ? item.iconFilled : item.icon}
                  </span>
                  <span
                    className={`text-sm ${
                      isActive
                        ? 'font-medium text-gray-900 dark:text-white'
                        : 'text-gray-700 dark:text-gray-300'
                    }`}
                  >
                    {item.label}
                  </span>
                </button>
              )
            })}
          </nav>
        </aside>
      </>
    )
  }

  // Desktop collapsed sidebar
  if (isCollapsed) {
    return (
      <aside className="fixed top-14 left-0 bottom-0 w-[72px] bg-white dark:bg-[#0f0f0f] hidden lg:block overflow-y-auto">
        <nav className="py-1">
          {navItems.map((item) => {
            const isActive = location.pathname === item.path
            return (
              <button
                key={item.id}
                onClick={() => handleNavClick(item.path)}
                className={`w-full flex flex-col items-center gap-1.5 py-4 px-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg mx-1 ${
                  isActive ? 'bg-gray-100 dark:bg-gray-800' : ''
                }`}
              >
                <span
                  className={
                    isActive
                      ? 'text-gray-900 dark:text-white'
                      : 'text-gray-600 dark:text-gray-400'
                  }
                >
                  {isActive && item.iconFilled ? item.iconFilled : item.icon}
                </span>
                <span
                  className={`text-[10px] ${
                    isActive
                      ? 'text-gray-900 dark:text-white'
                      : 'text-gray-700 dark:text-gray-300'
                  }`}
                >
                  {item.label}
                </span>
              </button>
            )
          })}
        </nav>
      </aside>
    )
  }

  // Desktop expanded sidebar
  return (
    <aside className="fixed top-14 left-0 bottom-0 w-60 bg-white dark:bg-[#0f0f0f] hidden lg:block overflow-y-auto border-r border-gray-200 dark:border-gray-800">
      <nav className="py-3">
        {navItems.map((item) => {
          const isActive = location.pathname === item.path
          return (
            <button
              key={item.id}
              onClick={() => handleNavClick(item.path)}
              className={`w-full flex items-center gap-6 px-6 py-2.5 hover:bg-gray-100 dark:hover:bg-gray-800 ${
                isActive ? 'bg-gray-100 dark:bg-gray-800' : ''
              }`}
            >
              <span
                className={
                  isActive
                    ? 'text-gray-900 dark:text-white'
                    : 'text-gray-600 dark:text-gray-400'
                }
              >
                {isActive && item.iconFilled ? item.iconFilled : item.icon}
              </span>
              <span
                className={`text-sm ${
                  isActive
                    ? 'font-medium text-gray-900 dark:text-white'
                    : 'text-gray-700 dark:text-gray-300'
                }`}
              >
                {item.label}
              </span>
            </button>
          )
        })}
      </nav>
    </aside>
  )
}
