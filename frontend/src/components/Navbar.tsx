import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { User, LogOut, ChevronDown, Loader2, Gauge } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { AuthModal } from './AuthModal';

export function Navbar() {
  const { mode, setMode, colors } = useTheme();
  const { user, userProfile, logout, loading } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login');
  const [showUserMenu, setShowUserMenu] = useState(false);

  const urbanLinks = [
    { path: '/assessment', label: 'Assessment' },
    { path: '/visualizer', label: '3D Visualizer' },
    { path: '/vendors', label: 'Vendor Connect' },
    { path: '/climate', label: 'Climate Risk' },
  ];

  const ruralLinks = [
    { path: '/gramin', label: 'Droplets' },
    { path: '/gramin/water-management', label: 'Water Management' },
    { path: '/gramin/smart-cropping', label: 'Smart Cropping' },
    { path: '/climate', label: 'Climate Risk' },
  ];

  const openAuth = (mode: 'login' | 'signup') => {
    setAuthMode(mode);
    setShowAuthModal(true);
  };

  const handleLogout = async () => {
    try {
      await logout();
      setShowUserMenu(false);
      navigate('/');
    } catch (err) {
      console.error('Logout error:', err);
    }
  };

  const links = mode === 'urban' ? urbanLinks : ruralLinks;

  // Switch world and land on that world's home page.
  const handleToggle = () => {
    const next = mode === 'urban' ? 'rural' : 'urban';
    setMode(next);
    navigate(next === 'rural' ? '/gramin' : '/');
  };

  return (
    <>
      <nav
        className="sticky top-0 z-50 shadow-md transition-colors duration-300"
        style={{ backgroundColor: colors.primary }}
      >
        <div className="w-full px-4 sm:px-6 lg:px-8">
          <div className="relative flex items-center justify-between h-20">
            {/* Left Section: Logo + INDRA Name - Extreme Left */}
            <Link to="/" className="flex items-center space-x-3 flex-shrink-0">
              <img
                src="https://i.postimg.cc/J7qCnnkZ/indra-icon.png"
                alt="INDRA Logo"
                className="h-10 w-10"
              />
              <h1 className="text-xl font-bold text-white">INDRA</h1>
            </Link>

            {/* Center Section: Navigation Links - Absolutely centered */}
            <div className="hidden lg:flex items-center absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
              <div className="flex items-center space-x-3">
                {links.map((link) => (
                  <Link
                    key={link.path}
                    to={link.path}
                    className={`px-4 py-2 rounded-lg font-medium transition-all whitespace-nowrap ${
                      location.pathname === link.path
                        ? 'bg-white text-blue-600 shadow-md'
                        : 'bg-white bg-opacity-20 text-white hover:bg-opacity-30'
                    }`}
                  >
                    {link.label}
                  </Link>
                ))}
              </div>
            </div>

            {/* Right Section: Mode Toggle + Auth/Profile - Extreme Right */}
            <div className="flex items-center space-x-4 flex-shrink-0">
              {/* Toggle Section */}
              <div className="hidden sm:flex items-center space-x-2">
                <span className="text-white text-sm font-medium">Standard</span>
                <button
                  type="button"
                  onClick={handleToggle}
                  className="relative w-14 h-7 rounded-full transition-colors duration-300 focus:outline-none focus:ring-2 focus:ring-white focus:ring-opacity-50"
                  style={{ backgroundColor: 'rgba(255, 255, 255, 0.3)' }} 
                >
                  <div
                    className={`absolute top-0.5 left-0.5 w-6 h-6 bg-white rounded-full shadow-md transition-transform duration-300 ${
                      mode === 'rural' ? 'transform translate-x-7' : ''
                    }`}
                  />
                </button>
                <span className="text-white text-sm font-medium">Gramin</span>
              </div>

              {/* Auth Section */}
              {loading ? (
                <div className="w-10 h-10 flex items-center justify-center">
                  <Loader2 className="w-5 h-5 text-white animate-spin" />
                </div>
              ) : user ? (
                // Logged in - Show profile dropdown
                <div className="relative">
                  <button
                    onClick={() => setShowUserMenu(!showUserMenu)}
                    className="flex items-center gap-2 px-3 py-2 bg-white bg-opacity-20 rounded-lg hover:bg-opacity-30 transition-all"
                  >
                    <div className="w-8 h-8 bg-white rounded-full flex items-center justify-center">
                      <User className="w-4 h-4" style={{ color: colors.primary }} />
                    </div>
                    <span className="text-white text-sm font-medium hidden lg:block max-w-[100px] truncate">
                      {userProfile?.name || user.email?.split('@')[0]}
                    </span>
                    <ChevronDown className={`w-4 h-4 text-white transition-transform ${showUserMenu ? 'rotate-180' : ''}`} />
                  </button>

                  {/* Dropdown Menu */}
                  {showUserMenu && (
                    <div className="absolute right-0 mt-2 w-48 bg-white rounded-xl shadow-lg py-2 z-50">
                      <Link
                        to="/profile"
                        onClick={() => setShowUserMenu(false)}
                        className="flex items-center gap-2 px-4 py-2 text-gray-700 hover:bg-gray-50 transition-all"
                      >
                        <User className="w-4 h-4" />
                        My Profile
                      </Link>
                      <Link
                        to="/tanks"
                        onClick={() => setShowUserMenu(false)}
                        className="flex items-center gap-2 px-4 py-2 text-gray-700 hover:bg-gray-50 transition-all"
                      >
                        <Gauge className="w-4 h-4" />
                        My Tanks
                      </Link>
                      <hr className="my-1" />
                      <button
                        onClick={handleLogout}
                        className="flex items-center gap-2 px-4 py-2 text-red-600 hover:bg-red-50 transition-all w-full text-left"
                      >
                        <LogOut className="w-4 h-4" />
                        Logout
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                // Not logged in - Show login/signup buttons
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => openAuth('login')}
                    className="px-4 py-2 bg-white bg-opacity-20 rounded-lg text-white font-medium hover:bg-opacity-30 transition-all"
                  >
                    Login
                  </button>
                  <button
                    onClick={() => openAuth('signup')}
                    className="px-4 py-2 bg-white rounded-lg font-medium hover:bg-opacity-90 transition-all"
                    style={{ color: colors.primary }}
                  >
                    Sign Up
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Small screens: the centered link row is hidden, so show the same links as a scrollable strip */}
        <div className="lg:hidden flex gap-2 overflow-x-auto px-4 pb-3 -mt-1" aria-label="Primary">
          {links.map((link) => (
            <Link
              key={link.path}
              to={link.path}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-all ${
                location.pathname === link.path ? 'bg-white text-blue-600' : 'bg-white bg-opacity-20 text-white'
              }`}
            >
              {link.label}
            </Link>
          ))}
        </div>
      </nav>

      {/* Auth Modal */}
      <AuthModal 
        isOpen={showAuthModal} 
        onClose={() => setShowAuthModal(false)} 
        initialMode={authMode}
      />

      {/* Click outside to close user menu */}
      {showUserMenu && (
        <div 
          className="fixed inset-0 z-40" 
          onClick={() => setShowUserMenu(false)}
        />
      )}
    </>
  );
}