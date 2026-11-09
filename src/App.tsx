import { lazy, Suspense } from 'react'
import './App.css'

// Each part of the site loads only when someone opens it, so the public site stays light.
const Portfolio = lazy(() => import('./portfolio/Portfolio'))
const ClientGallery = lazy(() => import('./components/ClientGallery'))
const ReviewPage = lazy(() => import('./components/ReviewPage'))
const Studio = lazy(() => import('./Studio'))

function Page() {
  const path = window.location.pathname
  const gallery = path.match(/^\/g\/([^/]+)/)
  if (gallery) return <ClientGallery token={gallery[1]} />
  if (path.startsWith('/review')) return <ReviewPage />
  if (path.startsWith('/studio')) return <Studio />
  return <Portfolio />
}

export default function App() {
  return (
    <Suspense fallback={<div className="app-boot" aria-label="Loading" />}>
      <Page />
    </Suspense>
  )
}
