import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { getExperiments } from '@/api/admin'
import type { ExperimentsListResponse, Experiment } from '@/types'

export default function Dashboard(): JSX.Element {
  const { data, isLoading } = useQuery<ExperimentsListResponse>({
    queryKey: ['experiments'],
    queryFn: getExperiments,
  })

  const experiments: Experiment[] = data?.experiments || []
  const activeExperiments = experiments.filter((e) => e.status === 'active')
  const totalUsers = experiments.reduce((sum, e) => sum + e.total_users, 0)
  const totalVideos = experiments.reduce((sum, e) => sum + e.total_videos, 0)

  return (
    <div>
      <h2 className="text-2xl font-bold text-gray-900 mb-6">Dashboard</h2>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <div className="bg-white rounded-lg shadow p-6">
          <div className="text-gray-500 text-sm">Total Experiments</div>
          <div className="text-3xl font-bold text-gray-900">{experiments.length}</div>
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <div className="text-gray-500 text-sm">Active Experiments</div>
          <div className="text-3xl font-bold text-green-600">{activeExperiments.length}</div>
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <div className="text-gray-500 text-sm">Total Users</div>
          <div className="text-3xl font-bold text-gray-900">{totalUsers}</div>
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <div className="text-gray-500 text-sm">Total Videos</div>
          <div className="text-3xl font-bold text-gray-900">{totalVideos}</div>
        </div>
      </div>

      {/* Recent Experiments */}
      <div className="bg-white rounded-lg shadow">
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <h3 className="text-lg font-medium text-gray-900">Recent Experiments</h3>
          <Link
            to="/admin/experiments"
            className="text-blue-600 hover:text-blue-800 text-sm"
          >
            View all
          </Link>
        </div>
        <div className="divide-y divide-gray-200">
          {isLoading ? (
            <div className="px-6 py-4 text-gray-500">Loading...</div>
          ) : experiments.length === 0 ? (
            <div className="px-6 py-8 text-center text-gray-500">
              No experiments yet.{' '}
              <Link to="/admin/experiments" className="text-blue-600 hover:text-blue-800">
                Create one
              </Link>
            </div>
          ) : (
            experiments.slice(0, 5).map((experiment) => (
              <Link
                key={experiment.id}
                to={`/admin/experiments/${experiment.id}`}
                className="block px-6 py-4 hover:bg-gray-50"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium text-gray-900">{experiment.name}</div>
                    <div className="text-sm text-gray-500">
                      {experiment.user_groups.length} groups, {experiment.total_users} users,{' '}
                      {experiment.total_videos} videos
                    </div>
                  </div>
                  <span
                    className={`px-2 py-1 text-xs rounded-full ${
                      experiment.status === 'active'
                        ? 'bg-green-100 text-green-800'
                        : experiment.status === 'completed'
                          ? 'bg-gray-100 text-gray-800'
                          : 'bg-yellow-100 text-yellow-800'
                    }`}
                  >
                    {experiment.status}
                  </span>
                </div>
              </Link>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
