import { useNavigate, useLocation } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/contexts/AuthContext'

interface HeaderProps {
  columns?: number
  onColumnsChange?: (n: number) => void
}

export default function Header({ columns, onColumnsChange }: HeaderProps): JSX.Element {
  const navigate = useNavigate()
  const location = useLocation()
  const queryClient = useQueryClient()
  const { user, logout } = useAuth()

  const handleLogout = async (): Promise<void> => {
    await logout()
    navigate('/login')
  }

  const handleLogoClick = (e: React.MouseEvent): void => {
    e.preventDefault()
    if (location.pathname !== '/') {
      queryClient.invalidateQueries({ queryKey: ['feed'] })
    }
    navigate('/')
  }

  return (
    <header className="fixed top-0 left-0 right-0 h-14 bg-white dark:bg-[#0f0f0f] border-b border-gray-200 dark:border-gray-800 z-50 flex items-center px-4">
      <div className="flex items-center">
        <a
          href="/"
          className="flex items-center gap-1"
          onClick={handleLogoClick}
        >
          <img src="/icon.svg" alt="VidRecLab" className="w-8 h-8" />
          <span className="text-xl font-semibold text-gray-900 dark:text-white hidden sm:inline">
            VidRecLab
          </span>
        </a>
      </div>

      <div className="flex items-center gap-3 ml-auto">
        {columns !== undefined && onColumnsChange && (
          <div className="flex items-center gap-1">
            {[5, 6, 7, 8].map((n) => (
              <button
                key={n}
                onClick={() => onColumnsChange(n)}
                className={`w-7 h-7 text-xs font-medium rounded-full transition-colors ${
                  columns === n
                    ? 'bg-white text-black'
                    : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                }`}
              >
                {n}
              </button>
            ))}
          </div>
        )}
        <span className="text-sm text-gray-600 dark:text-gray-400 hidden md:inline">
          {user?.login_id}
        </span>
        <button
          onClick={handleLogout}
          className="px-3 py-1.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full"
        >
          Logout
        </button>
      </div>
    </header>
  )
}
