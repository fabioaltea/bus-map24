interface EmptyStateProps {
  message: string
  hint?: string
}

export default function EmptyState({ message, hint }: EmptyStateProps) {
  return (
    <div style={{ padding: '16px 12px', textAlign: 'center', color: '#888', fontSize: 13 }}>
      <div style={{ marginBottom: 4 }}>{message}</div>
      {hint && <div style={{ fontSize: 11, color: '#555' }}>{hint}</div>}
    </div>
  )
}
