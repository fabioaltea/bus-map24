import { Routes, Route } from 'react-router-dom'
import FeedListPage from './FeedListPage.js'
import FeedDetailPage from './FeedDetailPage.js'

export default function AdminApp() {
  return (
    <Routes>
      <Route index element={<FeedListPage />} />
      <Route path="feeds/:id" element={<FeedDetailPage />} />
    </Routes>
  )
}
