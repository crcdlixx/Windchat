import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from './stores/authStore'
import LoginPage from './pages/LoginPage'
import RegisterPage from './pages/RegisterPage'
import ChatLayout from './pages/ChatLayout'
import JoinGroupPage from './pages/JoinGroupPage'

export default function App() {
  const token = useAuthStore(s => s.accessToken)
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={!token ? <LoginPage /> : <Navigate to="/" />} />
        <Route path="/register" element={!token ? <RegisterPage /> : <Navigate to="/" />} />
        <Route path="/join/group/:groupId" element={token ? <JoinGroupPage /> : <Navigate to="/login" />} />
        <Route path="/*" element={token ? <ChatLayout /> : <Navigate to="/login" />} />
      </Routes>
    </BrowserRouter>
  )
}
