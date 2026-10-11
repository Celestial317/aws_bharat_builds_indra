import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTheme } from '../../contexts/ThemeContext';
import { useAuth } from '../../contexts/AuthContext';
import { api, errorMessage } from '../../lib/api';
import { Droplets, Sparkles, Loader2, TrendingUp, AlertCircle, User, LogIn, MapPin, Home, Users, XCircle } from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from 'recharts';

interface WaterDistribution {
  irrigation_buckets: number;
  cattle_buckets: number;
  drinking_buckets: number;
  irrigation_pct: number;
  cattle_pct: number;
  drinking_pct: number;
}

interface AIResponse {
  distribution: WaterDistribution;
  recommendations: string[];
  ai_insights: string;
  water_status: string;
  gis_summary: string;
}

interface UserDataSummary {
  pincode: string;
  location: string;
  state: string;
  district: string;
  n_members: number;
  farmland_area: number;
  catchment_area: number;
}

export function WaterManagementPage() {
  const { colors } = useTheme();
  const { user, userProfile } = useAuth();
  const navigate = useNavigate();
  
  // Only variable inputs from user
  const [season, setSeason] = useState<'summer' | 'monsoon' | 'winter'>('monsoon');
  const [cropType, setCropType] = useState('');
  const [cattleCount, setCattleCount] = useState<number>(5);
  
  // AI Results
  const [loading, setLoading] = useState(false);
  const [distribution, setDistribution] = useState<WaterDistribution | null>(null);
  const [aiInsights, setAiInsights] = useState<string>('');
  const [recommendations, setRecommendations] = useState<string[]>([]);
  const [waterStatus, setWaterStatus] = useState<string>('');
  const [gisSummary, setGisSummary] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  // Get user data summary
  const userData: UserDataSummary | null = userProfile ? {
    pincode: userProfile.pincode || '',
    location: `${userProfile.district}, ${userProfile.state}`,
    state: userProfile.state,
    district: userProfile.district,
    n_members: userProfile.n_members,
    farmland_area: userProfile.farmland_area || 0,
    catchment_area: userProfile.catchment_area || 0
  } : null;

  // Convert catchment_area from sq meters to acres (1 acre = 4046.86 sq meters)
  const farmSizeAcres = userData ? (userData.farmland_area || userData.catchment_area) / 4046.86 : 2;

  const getAIPrediction = async () => {
    if (!userData) return;
    
    setLoading(true);
    setError(null);
    // Reset previous results to avoid showing stale data on error
    setDistribution(null);
    setAiInsights('');
    setRecommendations([]);
    setWaterStatus('');
    setGisSummary('');
    
    try {
      const data = await api<AIResponse>('/api/gramin/water-management/predict', {
        method: 'POST',
        body: {
          // Auto-fetched from user profile - pincode is primary identifier
          pincode: userData.pincode,
          location: userData.location,
          // Variable inputs
          season: season,
          crop_type: cropType || 'Mixed',
          cattle_count: cattleCount,
          // Auto-calculated from profile
          household_members: userData.n_members,
          farm_size_acres: Math.max(farmSizeAcres, 0.5),
        },
      });

      setDistribution(data.distribution);
      setAiInsights(data.ai_insights);
      setRecommendations(data.recommendations);
      setWaterStatus(data.water_status);
      setGisSummary(data.gis_summary);
      
    } catch (err) {
      setError(errorMessage(err, 'Failed to get the water plan'));
      // DO NOT set any fallback/fake data - show error instead
    } finally {
      setLoading(false);
    }
  };

  // Pie chart data
  const pieData = distribution ? [
    { name: 'Irrigation', value: distribution.irrigation_pct, buckets: distribution.irrigation_buckets, color: '#32a854' },
    { name: 'Cattle', value: distribution.cattle_pct, buckets: distribution.cattle_buckets, color: '#f59e0b' },
    { name: 'Drinking Water', value: distribution.drinking_pct, buckets: distribution.drinking_buckets, color: '#0676c8ff' },
  ] : [];

  const getStatusColor = (status: string) => {
    if (status.includes('Critical')) return '#ef4444';
    if (status.includes('Moderate')) return '#f59e0b';
    if (status.includes('Surplus')) return '#10b981';
    return '#3b82f6';
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
              Please login to access Smart Water Management. Your profile data will be used 
              to provide personalized water distribution recommendations.
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
    <div className="min-h-screen py-12" style={{ backgroundColor: colors.background }}>
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-5xl font-bold mb-4" style={{ color: colors.text }}>
            Smart Water Management
          </h1>
          <p className="text-lg text-gray-600">
            AI-Powered Distribution • Personalized for Your Farm
          </p>
        </div>

        {/* User Profile Summary Card */}
        {userData && (
          <div className="bg-gradient-to-r from-blue-50 to-green-50 rounded-2xl p-6 shadow-lg mb-8 border-2" style={{ borderColor: colors.primary }}>
            <div className="flex items-center gap-3 mb-4">
              <User className="w-6 h-6" style={{ color: colors.primary }} />
              <h3 className="text-lg font-bold" style={{ color: colors.text }}>
                Your Profile Data (Auto-fetched)
              </h3>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <div className="bg-white rounded-lg p-3 shadow-sm">
                <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
                  <MapPin className="w-4 h-4" />
                  Pincode
                </div>
                <div className="font-semibold" style={{ color: colors.primary }}>
                  {userData.pincode || 'Not set'}
                </div>
              </div>
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
                  <Users className="w-4 h-4" />
                  Family Members
                </div>
                <div className="font-semibold" style={{ color: colors.text }}>
                  {userData.n_members}
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
                  Catchment Area
                </div>
                <div className="font-semibold" style={{ color: colors.text }}>
                  {userData.catchment_area} m²
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Simplified Input Panel - Only Variable Inputs */}
        <div className="bg-white rounded-2xl p-8 shadow-xl mb-8 border-2" style={{ borderColor: colors.primary }}>
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-2xl font-bold" style={{ color: colors.text }}>
                Variable Inputs
              </h2>
              <p className="text-gray-500 text-sm mt-1">Only provide seasonal variables - rest is auto-calculated</p>
            </div>
            <button
              onClick={getAIPrediction}
              disabled={loading || !userData}
              className="flex items-center space-x-3 px-8 py-4 text-white rounded-xl font-bold text-lg hover:opacity-90 transition-opacity disabled:opacity-50 shadow-lg"
              style={{ backgroundColor: colors.primary }}
            >
              {loading ? (
                <>
                  <Loader2 className="w-6 h-6 animate-spin" />
                  <span>Analyzing...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-6 h-6" />
                  <span>Get AI Recommendation</span>
                </>
              )}
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Season - Required */}
            <div>
              <label className="block mb-2 text-sm font-semibold" style={{ color: colors.text }}>
                Season *
              </label>
              <select
                value={season}
                onChange={(e) => setSeason(e.target.value as 'summer' | 'monsoon' | 'winter')}
                className="w-full px-4 py-4 border-2 rounded-xl font-medium text-lg"
                style={{ borderColor: colors.primary }}
              >
                <option value="monsoon">Monsoon (June - Sept)</option>
                <option value="winter">Winter (Oct - Feb)</option>
                <option value="summer">Summer (March - May)</option>
              </select>
            </div>

            {/* Crop Type - Required */}
            <div>
              <label className="block mb-2 text-sm font-semibold" style={{ color: colors.text }}>
                Current/Planned Crop *
              </label>
              <select
                value={cropType}
                onChange={(e) => setCropType(e.target.value)}
                className="w-full px-4 py-4 border-2 rounded-xl font-medium text-lg"
                style={{ borderColor: colors.primary }}
              >
                <option value="">Select Crop</option>
                <option value="Rice">Rice (Paddy)</option>
                <option value="Wheat">Wheat</option>
                <option value="Maize">Maize (Corn)</option>
                <option value="Cotton">Cotton</option>
                <option value="Sugarcane">Sugarcane</option>
                <option value="Pulses">Pulses (Dal)</option>
                <option value="Vegetables">Vegetables</option>
                <option value="Fruits">Fruits</option>
                <option value="Mixed">Mixed Cropping</option>
              </select>
            </div>

            {/* Cattle Count - Variable */}
            <div>
              <label className="block mb-2 text-sm font-semibold" style={{ color: colors.text }}>
                Number of Cattle
              </label>
              <input
                type="number"
                value={cattleCount}
                onChange={(e) => setCattleCount(parseInt(e.target.value) || 0)}
                min="0"
                max="100"
                className="w-full px-4 py-4 border-2 rounded-xl font-medium text-lg"
                style={{ borderColor: colors.primary }}
                placeholder="0"
              />
            </div>
          </div>
        </div>

        {/* Results */}
        {/* Error Display */}
        {error && !loading && (
          <div className="bg-red-50 border-2 border-red-300 rounded-2xl p-6 shadow-xl mb-8">
            <div className="flex items-start gap-4">
              <XCircle className="w-8 h-8 text-red-500 flex-shrink-0 mt-1" />
              <div>
                <h3 className="text-xl font-bold text-red-700 mb-2">
                  Analysis Failed
                </h3>
                <p className="text-red-600 mb-4">
                  {error}
                </p>
                <div className="bg-red-100 rounded-lg p-4">
                  <p className="text-sm text-red-700 font-medium mb-2">Possible causes:</p>
                  <ul className="text-sm text-red-600 space-y-1 list-disc list-inside">
                    <li>Backend server may not be running (start with <code className="bg-red-200 px-1 rounded">uvicorn main:app</code>)</li>
                    <li>Your district/pincode may not be in our GIS database</li>
                    <li>Network connection issue</li>
                    <li>AI service temporarily unavailable</li>
                  </ul>
                </div>
                <button
                  onClick={() => setError(null)}
                  className="mt-4 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors text-sm font-medium"
                >
                  Dismiss
                </button>
              </div>
            </div>
          </div>
        )}

        {distribution && (
          <>
            {/* Status Banner */}
            <div 
              className="bg-white rounded-2xl p-6 shadow-xl mb-8 border-l-8"
              style={{ borderLeftColor: getStatusColor(waterStatus) }}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center space-x-3 mb-2">
                    <AlertCircle className="w-6 h-6" style={{ color: getStatusColor(waterStatus) }} />
                    <h3 className="text-2xl font-bold" style={{ color: getStatusColor(waterStatus) }}>
                      {waterStatus}
                    </h3>
                  </div>
                  <p className="text-gray-600 text-sm">{gisSummary}</p>
                </div>
              </div>
            </div>

            {/* Pie Chart & Distribution */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
              {/* Pie Chart */}
              <div className="bg-white rounded-2xl p-8 shadow-xl">
                <h3 className="text-2xl font-bold mb-6 text-center" style={{ color: colors.text }}>
                  Water Distribution
                </h3>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={pieData}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ name, value }) => `${name}: ${value}%`}
                      outerRadius={100}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      {pieData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              {/* Buckets Per Day */}
              <div className="bg-white rounded-2xl p-8 shadow-xl">
                <h3 className="text-2xl font-bold mb-6" style={{ color: colors.text }}>
                  Daily Water Needs
                </h3>
                <div className="space-y-6">
                  {pieData.map((item, idx) => (
                    <div key={idx} className="flex items-center justify-between p-4 rounded-xl" style={{ backgroundColor: `${item.color}15` }}>
                      <div className="flex items-center space-x-4">
                        <div className="w-4 h-4 rounded-full" style={{ backgroundColor: item.color }}></div>
                        <span className="font-semibold text-lg">{item.name}</span>
                      </div>
                      <div className="text-right">
                        <div className="text-3xl font-bold" style={{ color: item.color }}>
                          {item.buckets}
                        </div>
                        <div className="text-sm text-gray-600">buckets/day</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* AI Insights */}
            <div className="bg-gradient-to-r from-blue-50 to-green-50 rounded-2xl p-8 shadow-xl mb-8 border-2" style={{ borderColor: colors.primary }}>
              <h3 className="text-2xl font-bold mb-4 flex items-center" style={{ color: colors.primary }}>
                <Sparkles className="w-7 h-7 mr-3" />
                AI Insights
              </h3>
              <p className="text-lg mb-6 text-gray-800 leading-relaxed">{aiInsights}</p>
              
              {recommendations.length > 0 && (
                <div>
                  <h4 className="font-bold text-lg mb-3 flex items-center" style={{ color: colors.text }}>
                    <TrendingUp className="w-5 h-5 mr-2" />
                    Recommendations
                  </h4>
                  <ul className="space-y-2">
                    {recommendations.map((rec, idx) => (
                      <li key={idx} className="flex items-start bg-white rounded-lg p-3 shadow-sm">
                        <span className="text-green-600 font-bold mr-3">✓</span>
                        <span className="text-gray-700">{rec}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </>
        )}

        {/* Empty State */}
        {!distribution && !loading && !error && (
          <div className="text-center py-20">
            <Droplets className="w-24 h-24 mx-auto mb-6 text-gray-300" />
            <p className="text-xl text-gray-500">
              Select season and crop type, then click "Get AI Recommendation" 
            </p>
            <p className="text-gray-400 mt-2">
              Your profile data will be used automatically for accurate predictions
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
