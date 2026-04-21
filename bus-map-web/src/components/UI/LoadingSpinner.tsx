export default function LoadingSpinner() {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'center',
        padding: '20px',
      }}
      aria-label="Loading"
    >
      <div
        style={{
          width: 20,
          height: 20,
          border: '2px solid #333',
          borderTopColor: '#aaa',
          borderRadius: '50%',
          animation: 'spin 0.7s linear infinite',
        }}
      />
    </div>
  )
}
