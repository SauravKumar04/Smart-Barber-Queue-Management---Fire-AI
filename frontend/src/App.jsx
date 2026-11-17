import { Link, Route, Routes } from 'react-router-dom'
import Layout from './components/Layout.jsx'
import Auth from './pages/Auth.jsx'
import Dashboard from './pages/Dashboard.jsx'
import Home from './pages/Home.jsx'
import Join from './pages/Join.jsx'
import Status from './pages/Status.jsx'

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Home />} />
        <Route path="login" element={<Auth key="login" />} />
        <Route path="register" element={<Auth key="register" register />} />
        <Route path="owner" element={<Dashboard />} />
        <Route path="join/:shopId" element={<Join />} />
        <Route path="status/:key" element={<Status />} />
        <Route path="*" element={<section className="narrow panel">
          <h1>Page unavailable</h1><Link className="button primary mt-4" to="/">Go home</Link>
        </section>} />
      </Route>
    </Routes>
  )
}
