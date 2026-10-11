import { useEffect, useState, useCallback } from 'react';
import { useTheme } from '../../contexts/ThemeContext';
import { api, errorMessage } from '../../lib/api';
import {
  MapPin, Phone, Star, Store, Wrench, Package,
  ShoppingCart, Briefcase, Search, Loader2, AlertCircle, CheckCircle2,
  X, Bookmark, Share2, Heart, Mail, Globe
} from 'lucide-react';

interface Vendor {
  name: string;
  category: string;
  location?: string;
  contact?: string;
  email?: string;
  website?: string;
  description?: string;
  rating?: number;
  price_range?: string;
  distance?: number;
  /** curated directory | live web result | search link */
  source?: 'curated' | 'web' | 'search_link';
}


interface VendorResults {
  stores: Vendor[];
  mechanics: Vendor[];
  components: Vendor[];
  online_stores: Vendor[];
  service_providers: Vendor[];
}

interface SavedVendor extends Vendor {
  savedAt: string;
}

export function VendorConnectPage() {
  const { colors } = useTheme();
  const [vendors, setVendors] = useState<VendorResults>({
    stores: [],
    mechanics: [],
    components: [],
    online_stores: [],
    service_providers: []
  });
  const [savedVendors, setSavedVendors] = useState<SavedVendor[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [locationInput, setLocationInput] = useState('');
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [searchSuggestions] = useState(['Delhi', 'Mumbai', 'Bangalore', 'Chennai', 'Hyderabad', 'Pune', 'Kolkata']);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const fetchVendors = useCallback(async (location: string, retry = false) => {
    if (!location.trim()) {
      setError('Please enter a location');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 20000);
      let data: { success: boolean; results?: VendorResults };
      try {
        data = await api<{ success: boolean; results?: VendorResults }>('/api/vendors/search', {
          query: { location: location.trim(), search_type: 'all' },
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeoutId);
      }
      if (data.success && data.results) {
        setVendors(data.results);
        setSuccessMessage(`Found ${Object.values(data.results).flat().length} vendors in ${location}`);
        setTimeout(() => setSuccessMessage(null), 3000);
        setRetryCount(0);
      } else {
        throw new Error('Invalid response from server');
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        setError('Request timeout. The server is taking too long to respond.');
      } else {
        setError(errorMessage(err, 'Failed to fetch vendors'));
      }

      // One automatic retry for transient failures
      if (!retry && retryCount < 1) {
        setTimeout(() => {
          setRetryCount((prev) => prev + 1);
          void fetchVendors(location, true);
        }, 2000);
      }
    } finally {
      setLoading(false);
    }
  }, [retryCount]);

  useEffect(() => {
    // Load saved vendors from localStorage
    const saved = localStorage.getItem('savedVendors');
    if (saved) {
      setSavedVendors(JSON.parse(saved));
    }
  }, []);

  const handleSearch = () => {
    setShowSuggestions(false);
    fetchVendors(locationInput);
  };

  const handleSaveVendor = (vendor: Vendor) => {
    const savedVendor: SavedVendor = {
      ...vendor,
      savedAt: new Date().toISOString()
    };
    const updated = [...savedVendors, savedVendor];
    setSavedVendors(updated);
    localStorage.setItem('savedVendors', JSON.stringify(updated));
    setSuccessMessage('Vendor saved!');
    setTimeout(() => setSuccessMessage(null), 2000);
  };

  const handleRemoveSaved = (index: number) => {
    const updated = savedVendors.filter((_, i) => i !== index);
    setSavedVendors(updated);
    localStorage.setItem('savedVendors', JSON.stringify(updated));
  };

  const handleShare = async (vendor: Vendor) => {
    const text = `Check out ${vendor.name} for RWH services!\n${vendor.description}\nContact: ${vendor.contact || 'See website'}\n${vendor.website || ''}`;

    if (navigator.share) {
      try {
        await navigator.share({ title: vendor.name, text });
      } catch (err) {
        console.log('Share failed', err);
      }
    } else {
      navigator.clipboard.writeText(text);
      setSuccessMessage('Copied to clipboard!');
      setTimeout(() => setSuccessMessage(null), 2000);
    }
  };

  const getCategoryIcon = (category: string) => {
    const iconProps = { className: "w-5 h-5", strokeWidth: 2 };
    switch (category) {
      case 'stores': return <Store {...iconProps} />;
      case 'mechanics': return <Wrench {...iconProps} />;
      case 'components': return <Package {...iconProps} />;
      case 'online_stores': return <ShoppingCart {...iconProps} />;
      case 'service_providers': return <Briefcase {...iconProps} />;
      default: return <Store {...iconProps} />;
    }
  };

  const getCategoryTitle = (category: string) => {
    const titles: Record<string, string> = {
      stores: 'Local Stores',
      mechanics: 'Mechanics & Contractors',
      components: 'Component Suppliers',
      online_stores: 'Online Stores',
      service_providers: 'Service Providers'
    };
    return titles[category] || category;
  };

  const renderVendorCard = (vendor: Vendor) => {
    const isSaved = savedVendors.some(v => v.name === vendor.name && v.contact === vendor.contact);

    return (
      <div
        key={vendor.name + vendor.contact}
        className="bg-white rounded-xl shadow-sm hover:shadow-xl transition-all duration-300 overflow-hidden border border-gray-100 group"
      >
        {/* Card Header */}
        <div className="p-6 pb-4">
          <div className="flex items-start justify-between mb-3">
            <div className="flex-1">
              <h3 className="text-xl font-bold mb-1 group-hover:text-blue-600 transition-colors" style={{ color: colors.text }}>
                {vendor.name}
              </h3>
              {vendor.source && vendor.source !== 'curated' && (
                <span className="mb-1 inline-block rounded-full bg-gray-100 px-2 py-0.5 text-[11px] text-gray-600">
                  {vendor.source === 'web' ? 'Live web result - verify before contacting' : 'Search link'}
                </span>
              )}
              {vendor.rating && (
                <div className="flex items-center space-x-2">
                  <div className="flex items-center space-x-1 bg-yellow-50 px-2 py-1 rounded-full">
                    <Star className="w-4 h-4 fill-yellow-400 text-yellow-400" />
                    <span className="text-sm font-bold text-yellow-700">{vendor.rating.toFixed(1)}</span>
                  </div>
                  {vendor.price_range && (
                    <span className="text-sm font-semibold px-2 py-1 bg-green-50 text-green-700 rounded-full">
                      {vendor.price_range}
                    </span>
                  )}
                </div>
              )}
            </div>
            <button
              onClick={() => isSaved ? null : handleSaveVendor(vendor)}
              className={`p-2 rounded-full transition-all ${isSaved ? 'bg-red-50 text-red-500' : 'hover:bg-gray-100'}`}
              title={isSaved ? 'Saved' : 'Save vendor'}
            >
              <Heart className={`w-5 h-5 ${isSaved ? 'fill-current' : ''}`} />
            </button>
          </div>

          {vendor.description && (
            <p className="text-sm mb-3 line-clamp-2" style={{ color: colors.textSecondary }}>
              {vendor.description}
            </p>
          )}

          {/* Contact Info */}
          <div className="space-y-2 mb-4">
            {vendor.location && (
              <div className="flex items-center space-x-2 text-sm" style={{ color: colors.textSecondary }}>
                <MapPin className="w-4 h-4 flex-shrink-0" style={{ color: '#0676c8ff' }} />
                <span className="truncate">{vendor.location}</span>
                {vendor.distance && (
                  <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded text-xs font-medium flex-shrink-0">
                    {vendor.distance.toFixed(1)} km
                  </span>
                )}
              </div>
            )}

            {vendor.contact && (
              <div className="flex items-center space-x-2 text-sm" style={{ color: colors.textSecondary }}>
                <Phone className="w-4 h-4 flex-shrink-0" style={{ color: '#32a854' }} />
                <a href={`tel:${vendor.contact.replace(/[^+\d]/g, '')}`} className="hover:underline font-medium text-green-600">
                  {vendor.contact}
                </a>
              </div>
            )}

            {vendor.email && (
              <div className="flex items-center space-x-2 text-sm" style={{ color: colors.textSecondary }}>
                <Mail className="w-4 h-4 flex-shrink-0" style={{ color: '#f59e0b' }} />
                <a href={`mailto:${vendor.email}`} className="hover:underline font-medium text-amber-600">
                  {vendor.email}
                </a>
              </div>
            )}

            {vendor.website && (
              <div className="flex items-center space-x-2 text-sm">
                <Globe className="w-4 h-4 flex-shrink-0" style={{ color: '#0676c8ff' }} />
                <a
                  href={vendor.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:underline truncate font-medium"
                  style={{ color: '#0676c8ff' }}
                >
                  {vendor.website.replace(/^https?:\/\/(www\.)?/, '').split('/')[0]}
                </a>
              </div>
            )}
          </div>
        </div>

        {/* Card Footer - Action Buttons */}
        <div className="px-6 pb-6">
          <div className="flex flex-wrap gap-2">
            {/* Call Button */}
            {vendor.contact && (
              <a
                href={`tel:${vendor.contact.replace(/[^+\d]/g, '')}`}
                className="flex-1 min-w-[100px] px-4 py-2.5 text-white rounded-lg font-semibold hover:opacity-90 transition-all flex items-center justify-center space-x-2 shadow-sm"
                style={{ backgroundColor: '#32a854' }}
              >
                <Phone className="w-4 h-4" />
                <span>Call</span>
              </a>
            )}

            {/* Email Button */}
            {vendor.email && (
              <a
                href={`mailto:${vendor.email}?subject=RWH%20Inquiry%20from%20INDRA&body=Hi%2C%0A%0AI%20found%20your%20contact%20on%20INDRA%20(Rainwater%20Harvesting%20Platform).%20I%20am%20interested%20in%20your%20services.%0A%0APlease%20share%20details%20about%3A%0A-%20Pricing%0A-%20Installation%20timeline%0A-%20Product%20options%0A%0AThank%20you.`}
                className="flex-1 min-w-[100px] px-4 py-2.5 text-white rounded-lg font-semibold hover:opacity-90 transition-all flex items-center justify-center space-x-2 shadow-sm"
                style={{ backgroundColor: '#f59e0b' }}
              >
                <Mail className="w-4 h-4" />
                <span>Email</span>
              </a>
            )}

            {/* Website Button */}
            {vendor.website && (
              <a
                href={vendor.website}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 min-w-[100px] px-4 py-2.5 text-white rounded-lg font-semibold hover:opacity-90 transition-all flex items-center justify-center space-x-2 shadow-sm"
                style={{ backgroundColor: '#0676c8ff' }}
              >
                <Globe className="w-4 h-4" />
                <span>Website</span>
              </a>
            )}

            {/* Share Button */}
            <button
              onClick={() => handleShare(vendor)}
              className="px-4 py-2.5 border-2 rounded-lg hover:bg-gray-50 transition-all"
              style={{ borderColor: '#0676c8ff', color: '#0676c8ff' }}
              title="Share vendor"
            >
              <Share2 className="w-4 h-4" />
            </button>
          </div>

          {/* Fallback: If no direct contact, show search link */}
          {!vendor.contact && !vendor.email && !vendor.website && (
            <a
              href={`https://www.google.com/search?q=${encodeURIComponent(vendor.name + ' ' + (vendor.location || ''))}`}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full px-4 py-2.5 text-white rounded-lg font-semibold hover:opacity-90 transition-all flex items-center justify-center space-x-2 shadow-sm"
              style={{ backgroundColor: '#0676c8ff' }}
            >
              <Search className="w-4 h-4" />
              <span>Search on Google</span>
            </a>
          )}
        </div>
      </div>
    );
  };

  const getVendorsByCategory = (): Array<[string, Vendor[]]> => {
    if (activeCategory === 'all') {
      return Object.entries(vendors) as Array<[string, Vendor[]]>;
    }
    return [[activeCategory, vendors[activeCategory as keyof VendorResults]]];
  };

  return (
    <div className="min-h-screen transition-colors duration-300 py-8" style={{ backgroundColor: colors.background }}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Hero Section */}
        <div className="text-center mb-8">
          <h1 className="text-5xl font-bold mb-3 bg-gradient-to-r from-blue-600 to-blue-400 bg-clip-text text-transparent">
            Find RWH Vendors & Resources
          </h1>
          <p className="text-lg" style={{ color: colors.textSecondary }}>
            Connect with trusted rainwater harvesting experts in your area
          </p>
        </div>

        {/* Success/Error Messages */}
        {successMessage && (
          <div className="mb-6 mx-auto max-w-2xl bg-green-50 border-l-4 border-green-500 p-4 rounded-lg flex items-center space-x-3 animate-fade-in">
            <CheckCircle2 className="w-5 h-5 text-green-500 flex-shrink-0" />
            <span className="text-green-700 font-medium">{successMessage}</span>
          </div>
        )}

        {error && (
          <div className="mb-6 mx-auto max-w-2xl bg-red-50 border-l-4 border-red-500 p-4 rounded-lg">
            <div className="flex items-start space-x-3">
              <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-red-700 font-medium">{error}</p>
                {retryCount > 0 && (
                  <p className="text-sm text-red-600 mt-1">Retrying... (Attempt {retryCount}/2)</p>
                )}
              </div>
              <button onClick={() => setError(null)} className="text-red-500 hover:text-red-700">
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>
        )}

        {/* Search Section */}
        <div className="bg-white rounded-2xl p-8 shadow-lg mb-8 border border-gray-100">
          <div className="flex flex-col md:flex-row gap-4 mb-6">
            <div className="flex-1 relative">
              <div className="relative">
                <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5" style={{ color: '#0676c8ff' }} />
                <input
                  type="text"
                  value={locationInput}
                  onChange={(e) => {
                    setLocationInput(e.target.value);
                    setShowSuggestions(true);
                  }}
                  onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                  onFocus={() => setShowSuggestions(true)}
                  placeholder="Enter your city (e.g., Delhi, Mumbai, Bangalore)"
                  className="w-full pl-12 pr-4 py-4 border-2 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-lg transition-all"
                  style={{ borderColor: '#0676c8ff' }}
                />
              </div>

              {/* Search Suggestions */}
              {showSuggestions && locationInput.length > 0 && (
                <div className="absolute z-10 w-full mt-2 bg-white rounded-lg shadow-xl border border-gray-200 max-h-60 overflow-auto">
                  {searchSuggestions
                    .filter(s => s.toLowerCase().includes(locationInput.toLowerCase()))
                    .map((suggestion) => (
                      <button
                        key={suggestion}
                        onClick={() => {
                          setLocationInput(suggestion);
                          setShowSuggestions(false);
                          fetchVendors(suggestion);
                        }}
                        className="w-full px-4 py-3 text-left hover:bg-blue-50 transition-colors flex items-center space-x-2"
                      >
                        <MapPin className="w-4 h-4" style={{ color: '#0676c8ff' }} />
                        <span>{suggestion}</span>
                      </button>
                    ))}
                </div>
              )}
            </div>

            <button
              onClick={handleSearch}
              disabled={loading || !locationInput.trim()}
              className="px-8 py-4 text-white rounded-xl font-bold hover:opacity-90 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2 shadow-lg"
              style={{ backgroundColor: '#0676c8ff' }}
            >
              {loading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>Searching...</span>
                </>
              ) : (
                <>
                  <Search className="w-5 h-5" />
                  <span>Find Vendors</span>
                </>
              )}
            </button>
          </div>

          {/* Category Filters */}
          <div className="flex flex-wrap gap-2">
            {['all', 'stores', 'mechanics', 'components', 'online_stores', 'service_providers'].map((cat) => (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className={`px-4 py-2 rounded-lg font-medium transition-all flex items-center space-x-2 ${activeCategory === cat
                  ? 'text-white shadow-md scale-105'
                  : 'bg-gray-100 hover:bg-gray-200'
                  }`}
                style={activeCategory === cat ? { backgroundColor: '#0676c8ff' } : { color: colors.textSecondary }}
              >
                {cat !== 'all' && getCategoryIcon(cat)}
                <span>{cat === 'all' ? 'All Categories' : getCategoryTitle(cat)}</span>
              </button>
            ))}
          </div>
        </div>


        {/* Vendor Results */}
        {getVendorsByCategory().map(([category, list]) => {
          if (!list || list.length === 0) return null;

          return (
            <div key={category} className="mb-10">
              <div className="flex items-center justify-between mb-6 pb-4 border-b-2" style={{ borderColor: '#0676c8ff' }}>
                <div className="flex items-center space-x-4">
                  <div className="p-3 rounded-xl shadow-md text-white" style={{ backgroundColor: '#0676c8ff' }}>
                    {getCategoryIcon(category)}
                  </div>
                  <div>
                    <h2 className="text-3xl font-bold" style={{ color: colors.text }}>
                      {getCategoryTitle(category)}
                    </h2>
                    <p className="text-sm mt-1" style={{ color: colors.textSecondary }}>
                      {list.length} {list.length === 1 ? 'vendor' : 'vendors'} found
                    </p>
                  </div>
                </div>
                <div className="px-4 py-2 bg-blue-100 text-blue-800 rounded-full font-bold">
                  {list.length}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {list.map((vendor) => renderVendorCard(vendor))}
              </div>
            </div>
          );
        })}

        {/* Empty States */}
        {!loading && Object.values(vendors).every(v => v.length === 0) && locationInput && (
          <div className="text-center py-20 bg-white rounded-2xl shadow-sm">
            <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-blue-100 flex items-center justify-center">
              <AlertCircle className="w-10 h-10" style={{ color: '#0676c8ff' }} />
            </div>
            <h3 className="text-2xl font-bold mb-2" style={{ color: colors.text }}>
              No vendors found
            </h3>
            <p className="text-lg mb-6" style={{ color: colors.textSecondary }}>
              We couldn't find any vendors in "{locationInput}"
            </p>
            <button
              onClick={() => setLocationInput('')}
              className="px-6 py-3 text-white rounded-lg font-semibold hover:opacity-90 transition-all"
              style={{ backgroundColor: '#0676c8ff' }}
            >
              Try Another Location
            </button>
          </div>
        )}

        {!locationInput && !loading && (
          <div className="text-center py-20 bg-gradient-to-br from-blue-50 to-green-50 rounded-2xl">
            <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-white shadow-lg flex items-center justify-center">
              <Search className="w-10 h-10" style={{ color: '#0676c8ff' }} />
            </div>
            <h3 className="text-2xl font-bold mb-2" style={{ color: colors.text }}>
              Start Your Search
            </h3>
            <p className="text-lg" style={{ color: colors.textSecondary }}>
              Enter your location above to discover RWH vendors and service providers
            </p>
          </div>
        )}

        {/* Saved Vendors Section */}
        {savedVendors.length > 0 && (
          <div className="mt-10 bg-white rounded-2xl p-8 shadow-lg border border-gray-100">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold flex items-center space-x-2" style={{ color: colors.text }}>
                <Bookmark className="w-6 h-6" style={{ color: '#0676c8ff' }} />
                <span>Saved Vendors ({savedVendors.length})</span>
              </h2>
              <button
                onClick={() => {
                  setSavedVendors([]);
                  localStorage.removeItem('savedVendors');
                }}
                className="text-sm text-red-600 hover:text-red-700 font-medium"
              >
                Clear All
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {savedVendors.map((vendor, idx) => (
                <div key={idx} className="relative">
                  {renderVendorCard(vendor)}
                  <button
                    onClick={() => handleRemoveSaved(idx)}
                    className="absolute top-2 right-2 p-2 bg-white rounded-full shadow-md hover:bg-red-50 transition-colors"
                  >
                    <X className="w-4 h-4 text-red-500" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
