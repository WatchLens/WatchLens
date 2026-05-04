import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getUITemplates, createUITemplate, deleteUITemplate, duplicateUITemplate } from '@/api/admin'
import type { UITemplateListItem } from '@/types'

export default function UICustom(): JSX.Element {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [newName, setNewName] = useState('')
  const [newDescription, setNewDescription] = useState('')

  const { data: templates = [], isLoading } = useQuery({
    queryKey: ['ui-templates'],
    queryFn: () => getUITemplates(),
  })

  const createMutation = useMutation({
    mutationFn: createUITemplate,
    onSuccess: (template) => {
      queryClient.invalidateQueries({ queryKey: ['ui-templates'] })
      setShowCreateModal(false)
      setNewName('')
      setNewDescription('')
      navigate(`/admin/ui-custom/${template.id}`)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: deleteUITemplate,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ui-templates'] })
    },
  })

  const duplicateMutation = useMutation({
    mutationFn: duplicateUITemplate,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ui-templates'] })
    },
  })

  const handleCreate = (): void => {
    if (!newName.trim()) return
    createMutation.mutate({ name: newName.trim(), description: newDescription.trim() || undefined })
  }

  const handleDelete = (template: UITemplateListItem): void => {
    if (confirm(`Delete template "${template.name}"?`)) {
      deleteMutation.mutate(template.id)
    }
  }

  const formatDate = (dateStr: string): string => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">UI Templates</h2>
          <p className="text-gray-600 mt-1">Create and manage custom UI templates for experiments</p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium"
        >
          + New Template
        </button>
      </div>

      {isLoading ? (
        <div className="text-gray-500 text-center py-12">Loading...</div>
      ) : templates.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-12 text-center">
          <div className="text-gray-400 text-lg mb-2">No templates yet</div>
          <p className="text-gray-500 text-sm mb-4">
            Create a custom UI template to customize how videos are displayed to users
          </p>
          <button
            onClick={() => setShowCreateModal(true)}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm"
          >
            Create your first template
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {templates.map((template) => (
            <div
              key={template.id}
              className="bg-white rounded-lg shadow hover:shadow-md transition-shadow cursor-pointer"
              onClick={() => navigate(`/admin/ui-custom/${template.id}`)}
            >
              {/* Preview placeholder */}
              <div className="h-40 bg-gradient-to-br from-gray-100 to-gray-200 rounded-t-lg flex items-center justify-center">
                <div className="grid grid-cols-3 gap-2 p-4 opacity-40">
                  {[1, 2, 3, 4, 5, 6].map((i) => (
                    <div key={i} className="w-12 h-8 bg-gray-400 rounded" />
                  ))}
                </div>
              </div>

              <div className="p-4">
                <div className="flex items-center justify-between mb-1">
                  <h3 className="font-semibold text-gray-900 truncate">{template.name}</h3>
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                      template.status === 'published'
                        ? 'bg-green-100 text-green-700'
                        : 'bg-yellow-100 text-yellow-700'
                    }`}
                  >
                    {template.status}
                  </span>
                </div>
                {template.description && (
                  <p className="text-gray-500 text-sm truncate mb-2">{template.description}</p>
                )}
                <div className="text-gray-400 text-xs">Updated {formatDate(template.updated_at)}</div>

                {/* Actions */}
                <div className="flex gap-2 mt-3 pt-3 border-t border-gray-100">
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      navigate(`/admin/ui-custom/${template.id}`)
                    }}
                    className="text-blue-600 hover:text-blue-800 text-xs font-medium"
                  >
                    Edit
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      duplicateMutation.mutate(template.id)
                    }}
                    className="text-gray-600 hover:text-gray-800 text-xs font-medium"
                  >
                    Duplicate
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      handleDelete(template)
                    }}
                    className="text-red-600 hover:text-red-800 text-xs font-medium ml-auto"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold mb-4">New Template</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g., Dark Minimal, Large Cards"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  autoFocus
                  onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Description <span className="text-gray-400">(optional)</span>
                </label>
                <input
                  type="text"
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  placeholder="Brief description of this template"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => {
                  setShowCreateModal(false)
                  setNewName('')
                  setNewDescription('')
                }}
                className="px-4 py-2 text-gray-600 hover:text-gray-800 text-sm"
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
                disabled={!newName.trim() || createMutation.isPending}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium disabled:opacity-50"
              >
                {createMutation.isPending ? 'Creating...' : 'Create & Edit'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
