import { Routes, Route, Navigate } from "react-router-dom"

import Home from "@/pages/Home"
import Auth from "@/pages/Auth"
import Upload from "@/pages/Upload"
import VideoPlayer from "@/pages/VideoPlayer"
import S3Import from "@/pages/S3Import"
import OAuthSuccess from "@/pages/OAuthSuccess"
import ResetPassword from "@/pages/ResetPassword"
import FavouritesPage from "@/pages/FavouritesPage"
import PlaylistPage from "@/pages/PlaylistPage"
import SearchPage from "@/pages/Search"
import PortraitPlayer from "@/pages/PortraitPlayer"
import OrganizationDashboard from "@/pages/OrganizationDashboard"
import OrganizationPage from "@/pages/OrganizationPage"
import AdminDashboard from "@/pages/AdminDashboard"
import SettingsPage from "@/pages/SettingsPage"

import MainLayout from "@/layouts/MainLayout"
import ProtectedRoute from "@/routes/ProtectedRoute"
import ProfilePage from "@/pages/ProfilePage"

function App() {
  return (
    <Routes>

      <Route path="/" element={<Navigate to="/login" replace />} />

      <Route path="/login" element={<Auth />} />
      <Route path="/register" element={<Auth />} />
      <Route path="/oauth-success" element={<OAuthSuccess />} />
      <Route path="/reset-password" element={<ResetPassword />} />

      <Route path="/video/:publicId" element={<VideoPlayer />} />
      <Route
        path="/portrait/:publicId"
        element={
          <ProtectedRoute>
            <PortraitPlayer />
          </ProtectedRoute>
        }
      />
      <Route
        path="/portrait"
        element={
          <ProtectedRoute>
            <PortraitPlayer />
          </ProtectedRoute>
        }
      />

      <Route
        element={
          <ProtectedRoute>
            <MainLayout />
          </ProtectedRoute>
        }
      >

        <Route path="/home" element={<Home />} />

        <Route path="/upload" element={<Upload />} />

        <Route path="/s3-import" element={<S3Import />} />

        <Route path="/favorites" element={<FavouritesPage />} />

        <Route path="/playlists" element={<PlaylistPage />} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/search" element={<SearchPage />} />
        <Route path="/organization" element={<OrganizationPage />} />
        <Route path="/organization/dashboard" element={<OrganizationDashboard />} />
        <Route path="/admin" element={<AdminDashboard />} />

      </Route>

    </Routes>
  )
}

export default App
