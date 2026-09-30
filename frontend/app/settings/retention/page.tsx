"use client"
import { PageHeader, EmptyState } from '@/components/ui/States'

export default function RetentionPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Retention & Cleanup" />
      <EmptyState
        title="Coming Soon"
        description="The frontend UI for configuring data retention is not yet fully implemented. Please use the /api/v1/retention API."
      />
    </div>
  )
}
