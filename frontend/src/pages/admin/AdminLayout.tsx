import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'

interface NavItem {
  path: string
  label: string
  exact?: boolean
}

const navItems: NavItem[] = [
  { path: '/admin', label: 'Dashboard', exact: true },
  { path: '/admin/experiments', label: 'Experiments' },
  { path: '/admin/ui-custom', label: 'UI Custom' },
]

export default function AdminLayout(): JSX.Element {
  const location = useLocation()
  const navigate = useNavigate()
  const { user, logout } = useAuth()

  const handleLogout = async (): Promise<void> => {
    await logout()
    navigate('/login')
  }

  const isActive = (item: NavItem): boolean => {
    if (item.exact) {
      return location.pathname === item.path
    }
    return location.pathname.startsWith(item.path)
  }

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Header */}
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-8">
            <h1 className="text-xl font-bold text-gray-900">
              VidRecLab Admin
            </h1>
            <nav className="flex gap-4">
              {navItems.map((item) => (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`px-3 py-2 rounded-md text-sm font-medium ${
                    isActive(item)
                      ? 'bg-gray-900 text-white'
                      : 'text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-gray-600 text-sm">{user?.login_id}</span>
            <button
              onClick={handleLogout}
              className="text-gray-600 hover:text-gray-900 text-sm"
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-7xl mx-auto px-4 py-8">
        <Outlet />
      </main>
    </div>
  )
}
