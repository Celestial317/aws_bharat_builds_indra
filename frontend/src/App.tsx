import { lazy, Suspense, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { ThemeProvider, useTheme } from './contexts/ThemeContext';
import { AuthProvider } from './contexts/AuthContext';
import { Navbar } from './components/Navbar';
import { Footer } from './components/Footer';
import { AIChatbot } from './components/AIChatbot';
import { ErrorBoundary } from './components/ErrorBoundary';

import { LandingPage } from './pages/urban/LandingPage';
import { CommunityDashboard } from './pages/gramin/CommunityDashboard';
import { AssessmentPage } from './pages/urban/AssessmentPage';
import { VendorConnectPage } from './pages/urban/VendorConnectPage';
import { ProfilePage } from './pages/urban/ProfilePage';
import { WaterManagementPage } from './pages/gramin/WaterManagementPage';
import { SmartCroppingPage } from './pages/gramin/SmartCroppingPage';
import { ClimatePage } from './pages/shared/ClimatePage';
import { TankMonitorPage } from './pages/shared/TankMonitorPage';

// The 3D scene pulls in three.js (~1 MB): load it only when someone opens the visualizer.
const VisualizerPage = lazy(() => import('./pages/urban/VisualizerPage').then((m) => ({ default: m.VisualizerPage })));

const URBAN_ONLY = ['/assessment', '/visualizer', '/vendors'];

/** Keep the Standard/Gramin toggle in step with the page, without full-page reloads. */
function useModeFromRoute() {
  const { pathname } = useLocation();
  const { mode, setMode } = useTheme();
  useEffect(() => {
    if (pathname.startsWith('/gramin') && mode !== 'rural') setMode('rural');
    else if ((pathname === '/' || URBAN_ONLY.includes(pathname)) && mode !== 'urban') setMode('urban');
  }, [pathname, mode, setMode]);
}

function PageFallback() {
  return <div className="flex h-[60vh] items-center justify-center text-gray-500">Loading...</div>;
}

function AppContent() {
  useModeFromRoute();
  const { pathname } = useLocation();

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <main className="flex-1">
        <ErrorBoundary resetKey={pathname}>
          <Suspense fallback={<PageFallback />}>
            <Routes>
              <Route path="/" element={<LandingPage />} />
              <Route path="/assessment" element={<AssessmentPage />} />
              <Route path="/visualizer" element={<VisualizerPage />} />
              <Route path="/vendors" element={<VendorConnectPage />} />
              <Route path="/profile" element={<ProfilePage />} />

              <Route path="/gramin" element={<CommunityDashboard />} />
              <Route path="/gramin/water-management" element={<WaterManagementPage />} />
              <Route path="/gramin/smart-cropping" element={<SmartCroppingPage />} />

              <Route path="/climate" element={<ClimatePage />} />
              <Route path="/tanks" element={<TankMonitorPage />} />

              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
        </ErrorBoundary>
      </main>
      <Footer />
      <AIChatbot />
    </div>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ThemeProvider>
          <AppContent />
        </ThemeProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
