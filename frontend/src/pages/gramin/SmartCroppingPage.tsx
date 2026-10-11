import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTheme } from '../../contexts/ThemeContext';
import { useAuth } from '../../contexts/AuthContext';
import { api, errorMessage } from '../../lib/api';
import { 
  Droplets, TrendingUp, IndianRupee, Sprout, Leaf, Users, Calendar, Loader2, MapPin, 
  LogIn, User, Home, Sparkles, AlertCircle 
} from 'lucide-react';

interface CropRecommendation {
  crop_name: string;
  water_requirement_liters: number;
  estimated_market_price_per_kg: number;
  yield_per_acre_kg: number;
  total_profit_estimate: number;
  price_per_liter_ratio: number;
  environmental_impact_score: number;
  soil_health_impact: string;
  farmer_ease_score: number;
  rank: number;
  justification: string;
}

interface CropSuggestionResponse {
  recommendations: CropRecommendation[];
  season_context: string;
  water_context: string;
  general_advice: string;
  data_note?: string;
  ai_enhanced?: boolean;
}

interface UserDataSummary {
  pincode: string;
  location: string;
  state: string;
  district: string;
  n_members: number;
  farmland_area: number;
  catchment_area: number;
  avg_rainfall: number;
}

export function SmartCroppingPage() {
  const { colors } = useTheme();
  const { user, userProfile } = useAuth();
  const navigate = useNavigate();
  
  // Only variable input from user
  const [season, setSeason] = useState('');
  
  // Optional override inputs (collapsed by default)
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [soilType, setSoilType] = useState('Loamy');
  const [waterAvailability, setWaterAvailability] = useState('Medium');
  
  // Response state
  const [loading, setLoading] = useState(false);
  const [cropData, setCropData] = useState<CropSuggestionResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Get user data summary
  const userData: UserDataSummary | null = userProfile ? {
    pincode: userProfile.pincode || '',
    location: `${userProfile.district}, ${userProfile.state}`,
    state: userProfile.state,
    district: userProfile.district,
    n_members: userProfile.n_members,
    farmland_area: userProfile.farmland_area || 0,
    catchment_area: userProfile.catchment_area || 0,
    avg_rainfall: userProfile.avg_rainfall || 800
  } : null;

  // Convert catchment_area from sq meters to acres (1 acre = 4046.86 sq meters)
  const farmSizeAcres = userData ? (userData.farmland_area || userData.catchment_area) / 4046.86 : 2;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userData || !season) return;
    
    setLoading(true);
    setError(null);
    setCropData(null);

    try {
      const data = await api<CropSuggestionResponse>('/api/gramin/crop-suggestions', {
        method: 'POST',
        body: {
          // Auto-fetched from user profile - pincode is primary identifier
          pincode: userData.pincode,
          location: userData.location,
          farm_size_acres: Math.max(farmSizeAcres, 0.5),
          rainfall_mm: userData.avg_rainfall,
          // Variable input
          season: season,
          // Optional overrides
          soil_type: soilType,
          water_availability: waterAvailability,
        },
      });
      setCropData(data);
    } catch (err) {
      setError(errorMessage(err, 'Failed to fetch crop suggestions'));
    } finally {
      setLoading(false);
    }
  };

  const getImpactColor = (score: number) => {
    if (score >= 8) return '#32a854';
    if (score >= 6) return '#0676c8ff';
    return '#f59e0b';
  };

  const getSoilHealthColor = (impact: string) => {
    if (impact === 'Positive') return '#32a854';
    if (impact === 'Neutral') return '#6b7280';
    return '#ef4444';
  };

  // If not logged in, show login prompt
  if (!user) {
    return (
      <div className="min-h-screen py-12" style={{ backgroundColor: colors.background }}>
        <div className="max-w-2xl mx-auto px-4">
          <div className="bg-white rounded-2xl p-12 shadow-xl text-center">
            <LogIn className="w-20 h-20 mx-auto mb-6" style={{ color: colors.primary }} />
            <h1 className="text-3xl font-bold mb-4" style={{ color: colors.text }}>
              Login Required
            </h1>
            <p className="text-gray-600 mb-8">
              Please login to access Smart Crop Recommendations. Your profile data (location, farm size, rainfall) 
              will be used to provide personalized crop suggestions.
            </p>
            <button
              onClick={() => navigate('/')}
              className="px-8 py-4 rounded-xl text-white font-bold text-lg hover:opacity-90 transition-opacity"
              style={{ backgroundColor: colors.primary }}
            >
              Go to Home & Login
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen transition-colors duration-300 py-12" style={{ backgroundColor: colors.background }}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold mb-4" style={{ color: colors.text }}>
            AI-Powered Smart Crop Recommendations
          </h1>
          <p className="text-lg" style={{ color: colors.textSecondary }}>
            Get water-efficient crop suggestions • Personalized for your location & farm
          </p>
        </div>

        {/* User Profile Summary Card */}
        {userData && (
          <div className="bg-gradient-to-r from-green-50 to-blue-50 rounded-2xl p-6 shadow-lg mb-8 border-2" style={{ borderColor: '#32a854' }}>
            <div className="flex items-center gap-3 mb-4">
              <User className="w-6 h-6" style={{ color: '#32a854' }} />
              <h3 className="text-lg font-bold" style={{ color: colors.text }}>
                Your Profile Data (Auto-fetched)
              </h3>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-white rounded-lg p-3 shadow-sm">
                <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
                  <MapPin className="w-4 h-4" />
                  Location
                </div>
                <div className="font-semibold" style={{ color: colors.text }}>
                  {userData.district}, {userData.state}
                </div>
              </div>
              <div className="bg-white rounded-lg p-3 shadow-sm">
                <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
                  <Home className="w-4 h-4" />
                  Farm Size
                </div>
                <div className="font-semibold" style={{ color: colors.text }}>
                  {farmSizeAcres.toFixed(2)} acres
                </div>
              </div>
              <div className="bg-white rounded-lg p-3 shadow-sm">
                <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
                  <Droplets className="w-4 h-4" />
                  Avg Rainfall
                </div>
                <div className="font-semibold" style={{ color: colors.text }}>
                  {userData.avg_rainfall} mm/year
                </div>
              </div>
              <div className="bg-white rounded-lg p-3 shadow-sm">
                <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
                  <Users className="w-4 h-4" />
                  Family Members
                </div>
                <div className="font-semibold" style={{ color: colors.text }}>
                  {userData.n_members}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Simplified Input Form */}
        <div className="bg-white rounded-2xl p-8 shadow-xl mb-8 border-2" style={{ borderColor: colors.primary }}>
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-2xl font-bold" style={{ color: colors.text }}>
                Select Season
              </h2>
              <p className="text-gray-500 text-sm mt-1">
                Only provide the season - rest is auto-calculated from your profile
              </p>
            </div>
          </div>
          
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Season Selection - Main Input */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <button
                type="button"
                onClick={() => setSeason('Kharif')}
                className={`p-6 rounded-xl border-3 transition-all ${
                  season === 'Kharif' ? 'ring-4 ring-green-300 scale-[1.02]' : 'hover:scale-[1.01]'
                }`}
                style={{ 
                  borderColor: season === 'Kharif' ? '#32a854' : '#e5e7eb',
                  backgroundColor: season === 'Kharif' ? '#f0fdf4' : 'white'
                }}
              >
                <div className="text-xl font-bold" style={{ color: colors.text }}>Kharif</div>
                <div className="text-sm text-gray-500">Monsoon Season</div>
                <div className="text-xs text-gray-400 mt-1">June - October</div>
              </button>
              
              <button
                type="button"
                onClick={() => setSeason('Rabi')}
                className={`p-6 rounded-xl border-3 transition-all ${
                  season === 'Rabi' ? 'ring-4 ring-blue-300 scale-[1.02]' : 'hover:scale-[1.01]'
                }`}
                style={{ 
                  borderColor: season === 'Rabi' ? '#0676c8ff' : '#e5e7eb',
                  backgroundColor: season === 'Rabi' ? '#eff6ff' : 'white'
                }}
              >
                <div className="text-xl font-bold" style={{ color: colors.text }}>Rabi</div>
                <div className="text-sm text-gray-500">Winter Season</div>
                <div className="text-xs text-gray-400 mt-1">November - March</div>
              </button>
              
              <button
                type="button"
                onClick={() => setSeason('Zaid')}
                className={`p-6 rounded-xl border-3 transition-all ${
                  season === 'Zaid' ? 'ring-4 ring-orange-300 scale-[1.02]' : 'hover:scale-[1.01]'
                }`}
                style={{ 
                  borderColor: season === 'Zaid' ? '#f59e0b' : '#e5e7eb',
                  backgroundColor: season === 'Zaid' ? '#fffbeb' : 'white'
                }}
              >
                <div className="text-xl font-bold" style={{ color: colors.text }}>Zaid</div>
                <div className="text-sm text-gray-500">Summer Season</div>
                <div className="text-xs text-gray-400 mt-1">March - June</div>
              </button>
            </div>

            {/* Advanced Options (Collapsed) */}
            <div className="border-t pt-4">
              <button
                type="button"
                onClick={() => setShowAdvanced(!showAdvanced)}
                className="text-sm font-medium flex items-center gap-2 hover:underline"
                style={{ color: colors.primary }}
              >
                <span>{showAdvanced ? '▼' : '▶'}</span>
                Advanced Options (Optional Overrides)
              </button>
              
              {showAdvanced && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                  <div>
                    <label className="flex items-center mb-2 font-medium text-sm" style={{ color: colors.text }}>
                      <Leaf className="w-4 h-4 mr-2" style={{ color: colors.primary }} />
                      Soil Type (Auto-detected: Loamy)
                    </label>
                    <select
                      value={soilType}
                      onChange={(e) => setSoilType(e.target.value)}
                      className="w-full px-4 py-3 border-2 rounded-lg focus:outline-none"
                      style={{ borderColor: '#e5e7eb' }}
                    >
                      <option value="Loamy">Loamy (Best for most crops)</option>
                      <option value="Clay">Clay (Heavy soil)</option>
                      <option value="Sandy">Sandy (Light soil)</option>
                      <option value="Silty">Silty (Fertile soil)</option>
                      <option value="Black">Black (Cotton soil)</option>
                      <option value="Red">Red (Weathered soil)</option>
                      <option value="Alluvial">Alluvial (River deposit)</option>
                    </select>
                  </div>
                  <div>
                    <label className="flex items-center mb-2 font-medium text-sm" style={{ color: colors.text }}>
                      <Droplets className="w-4 h-4 mr-2" style={{ color: colors.primary }} />
                      Water Availability (Auto-calculated)
                    </label>
                    <select
                      value={waterAvailability}
                      onChange={(e) => setWaterAvailability(e.target.value)}
                      className="w-full px-4 py-3 border-2 rounded-lg focus:outline-none"
                      style={{ borderColor: '#e5e7eb' }}
                    >
                      <option value="Low">Low (Scarce water)</option>
                      <option value="Medium">Medium (Moderate water)</option>
                      <option value="High">High (Abundant water)</option>
                    </select>
                  </div>
                </div>
              )}
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading || !season}
              className="w-full py-4 rounded-xl text-white font-bold text-lg flex items-center justify-center transition-all hover:opacity-90 disabled:opacity-50 shadow-lg"
              style={{ backgroundColor: colors.primary }}
            >
              {loading ? (
                <>
                  <Loader2 className="w-6 h-6 mr-3 animate-spin" />
                  Analyzing with AI...
                </>
              ) : (
                <>
                  <Sparkles className="w-6 h-6 mr-3" />
                  Get AI Crop Recommendations
                </>
              )}
            </button>
          </form>
        </div>

        {/* Error Display */}
        {error && (
          <div className="bg-red-50 border-l-4 border-red-500 p-6 rounded-lg mb-8">
            <div className="flex items-center">
              <AlertCircle className="w-6 h-6 text-red-500 mr-3" />
              <div>
                <h4 className="font-bold text-red-700">Error</h4>
                <p className="text-red-600">{error}</p>
              </div>
            </div>
          </div>
        )}

        {/* Results */}
        {cropData && (
          <>
            {/* Context Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
              <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-2xl p-6 shadow-lg">
                <div className="flex items-center mb-3">
                  <Calendar className="w-6 h-6 mr-2" style={{ color: '#32a854' }} />
                  <h3 className="font-bold text-lg" style={{ color: colors.text }}>Season Context</h3>
                </div>
                <p className="text-gray-700">{cropData.season_context}</p>
              </div>
              <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-2xl p-6 shadow-lg">
                <div className="flex items-center mb-3">
                  <Droplets className="w-6 h-6 mr-2" style={{ color: colors.primary }} />
                  <h3 className="font-bold text-lg" style={{ color: colors.text }}>Water Context</h3>
                </div>
                <p className="text-gray-700">{cropData.water_context}</p>
              </div>
            </div>

            {/* Crop Recommendations */}
            <h2 className="text-2xl font-bold mb-6" style={{ color: colors.text }}>
              Top Recommended Crops
            </h2>
            <div className="space-y-6">
              {cropData.recommendations.map((crop, index) => (
                <div
                  key={index}
                  className="bg-white rounded-2xl p-6 shadow-xl border-l-8 hover:shadow-2xl transition-shadow"
                  style={{ borderLeftColor: index === 0 ? '#32a854' : index === 1 ? '#0676c8ff' : '#f59e0b' }}
                >
                  <div className="flex flex-wrap items-start justify-between mb-4">
                    <div>
                      <div className="flex items-center gap-3">
                        <span className="text-3xl font-bold" style={{ color: colors.primary }}>
                          #{crop.rank}
                        </span>
                        <h3 className="text-2xl font-bold" style={{ color: colors.text }}>
                          {crop.crop_name}
                        </h3>
                      </div>
                      <p className="text-gray-600 mt-2 max-w-2xl">{crop.justification}</p>
                    </div>
                    <div className="text-right mt-2 md:mt-0">
                      <div className="text-3xl font-bold" style={{ color: '#32a854' }}>
                        ₹{crop.total_profit_estimate.toLocaleString()}
                      </div>
                      <div className="text-sm text-gray-500">Est. Profit</div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
                    <div className="bg-blue-50 rounded-lg p-3">
                      <div className="flex items-center text-sm text-gray-600 mb-1">
                        <Droplets className="w-4 h-4 mr-1" style={{ color: colors.primary }} />
                        Water Need
                      </div>
                      <div className="font-bold" style={{ color: colors.primary }}>
                        {crop.water_requirement_liters.toLocaleString()} L
                      </div>
                    </div>
                    <div className="bg-green-50 rounded-lg p-3">
                      <div className="flex items-center text-sm text-gray-600 mb-1">
                        <TrendingUp className="w-4 h-4 mr-1" style={{ color: '#32a854' }} />
                        Yield/Acre
                      </div>
                      <div className="font-bold" style={{ color: '#32a854' }}>
                        {crop.yield_per_acre_kg.toLocaleString()} kg
                      </div>
                    </div>
                    <div className="bg-yellow-50 rounded-lg p-3">
                      <div className="flex items-center text-sm text-gray-600 mb-1">
                        <IndianRupee className="w-4 h-4 mr-1 text-yellow-600" />
                        Price/kg
                      </div>
                      <div className="font-bold text-yellow-600">
                        ₹{crop.estimated_market_price_per_kg}
                      </div>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-3">
                      <div className="flex items-center text-sm text-gray-600 mb-1">
                        <Leaf className="w-4 h-4 mr-1" style={{ color: getSoilHealthColor(crop.soil_health_impact) }} />
                        Soil Health
                      </div>
                      <div className="font-bold" style={{ color: getSoilHealthColor(crop.soil_health_impact) }}>
                        {crop.soil_health_impact}
                      </div>
                    </div>
                  </div>

                  {/* Scores Bar */}
                  <div className="flex flex-wrap gap-4 mt-4 pt-4 border-t">
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-gray-500">Environmental:</span>
                      <div className="flex items-center">
                        <div 
                          className="h-2 rounded-full" 
                          style={{ 
                            width: `${crop.environmental_impact_score * 10}px`, 
                            backgroundColor: getImpactColor(crop.environmental_impact_score) 
                          }}
                        ></div>
                        <span className="ml-2 font-bold" style={{ color: getImpactColor(crop.environmental_impact_score) }}>
                          {crop.environmental_impact_score}/10
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-gray-500">Farmer Ease:</span>
                      <div className="flex items-center">
                        <div 
                          className="h-2 rounded-full bg-purple-500" 
                          style={{ width: `${crop.farmer_ease_score * 10}px` }}
                        ></div>
                        <span className="ml-2 font-bold text-purple-600">
                          {crop.farmer_ease_score}/10
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* General Advice */}
            {cropData.general_advice && (
              <div className="bg-gradient-to-r from-green-50 to-blue-50 rounded-2xl p-8 shadow-xl mt-8 border-2" style={{ borderColor: '#32a854' }}>
                <h3 className="text-xl font-bold mb-4 flex items-center" style={{ color: '#32a854' }}>
                  <Sparkles className="w-6 h-6 mr-3" />
                  AI Expert Advice
                </h3>
                <p className="text-gray-700 text-lg leading-relaxed">{cropData.general_advice}</p>
              </div>
            )}
            {cropData.data_note && <p className="mt-4 text-center text-xs text-gray-500">{cropData.data_note}</p>}
          </>
        )}

        {/* Empty State */}
        {!cropData && !loading && !error && (
          <div className="text-center py-16">
            <Sprout className="w-24 h-24 mx-auto mb-6 text-gray-300" />
            <p className="text-xl text-gray-500 mb-2">
              Select a season to rank crops by rupees earned per litre of water
            </p>
            <p className="text-gray-400">
              Your profile data will be used automatically for personalized suggestions
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

