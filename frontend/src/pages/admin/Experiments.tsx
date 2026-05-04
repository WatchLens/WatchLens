import { useState, FormEvent, ChangeEvent } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getExperiments, createExperiment, deleteExperiment } from '@/api/admin'
import type { ExperimentsListResponse, Experiment, ExperimentCreateRequest } from '@/types'

export default function Experiments(): JSX.Element {
  const [showForm, setShowForm] = useState<boolean>(false)
  const [newExperiment, setNewExperiment] = useState<ExperimentCreateRequest>({
    name: '',
    description: '',
  })
  const queryClient = useQueryClient()

  const { data, isLoading } = useQuery<ExperimentsListResponse>({
    queryKey: ['experiments'],
    queryFn: getExperiments,
  })

  const createMutation = useMutation<Experiment, Error, ExperimentCreateRequest>({
    mutationFn: createExperiment,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['experiments'] })
      setShowForm(false)
      setNewExperiment({ name: '', description: '' })
    },
  })

  const deleteMutation = useMutation<void, Error, number | string>({
    mutationFn: deleteExperiment,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['experiments'] })
    },
  })

  const handleCreate = (e: FormEvent<HTMLFormElement>): void => {
    e.preventDefault()
    createMutation.mutate(newExperiment)
  }

  const handleDelete = (id: number, name: string): void => {
    if (
      window.confirm(`Are you sure you want to delete "${name}"? This will delete all associated data.`)
    ) {
      deleteMutation.mutate(id)
    }
  }

  const experiments: Experiment[] = data?.experiments || []

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Experiments</h2>
        <button
          onClick={() => setShowForm(true)}
          className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700"
        >
          New Experiment
        </button>
      </div>

      {/* Create Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-lg p-6 w-full max-w-md">
            <h3 className="text-lg font-medium mb-4">Create Experiment</h3>
            <form onSubmit={handleCreate}>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Name</label>
                  <input
                    type="text"
                    required
                    value={newExperiment.name}
                    onChange={(e: ChangeEvent<HTMLInputElement>) =>
                      setNewExperiment({ ...newExperiment, name: e.target.value })
                    }
                    className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Description</label>
                  <textarea
                    value={newExperiment.description}
                    onChange={(e: ChangeEvent<HTMLTextAreaElement>) =>
                      setNewExperiment({ ...newExperiment, description: e.target.value })
                    }
                    className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md"
                    rows={3}
                  />
                </div>
              </div>
              <div className="mt-6 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-md"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createMutation.isPending}
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
                >
                  {createMutation.isPending ? 'Creating...' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Experiments List */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Name
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Status
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Groups
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Users
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Videos
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {isLoading ? (
              <tr>
                <td colSpan={6} className="px-6 py-4 text-center text-gray-500">
                  Loading...
                </td>
              </tr>
            ) : experiments.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-6 py-8 text-center text-gray-500">
                  No experiments yet. Create one to get started.
                </td>
              </tr>
            ) : (
              experiments.map((exp) => (
                <tr key={exp.id}>
                  <td className="px-6 py-4">
                    <Link
                      to={`/admin/experiments/${exp.id}`}
                      className="text-blue-600 hover:text-blue-800 font-medium"
                    >
                      {exp.name}
                    </Link>
                    {exp.description && (
                      <p className="text-gray-500 text-sm truncate max-w-xs">{exp.description}</p>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <span
                      className={`px-2 py-1 text-xs rounded-full ${
                        exp.status === 'active'
                          ? 'bg-green-100 text-green-800'
                          : exp.status === 'completed'
                            ? 'bg-gray-100 text-gray-800'
                            : 'bg-yellow-100 text-yellow-800'
                      }`}
                    >
                      {exp.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-gray-900">{exp.user_groups.length}</td>
                  <td className="px-6 py-4 text-gray-900">{exp.total_users}</td>
                  <td className="px-6 py-4 text-gray-900">{exp.total_videos}</td>
                  <td className="px-6 py-4">
                    <button
                      onClick={() => handleDelete(exp.id, exp.name)}
                      className="text-red-600 hover:text-red-800 text-sm"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
