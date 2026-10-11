import { useState, useEffect } from 'react';
import { X, Mail, Lock, User, MapPin, Users, Loader2, Eye, EyeOff, Droplets } from 'lucide-react';
import { useAuth, DEMO_DATA } from '../contexts/AuthContext';
import { CreateUserData } from '../types/database';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialMode?: 'login' | 'signup';
}

const INDIAN_STATES = [
  'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh',
  'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jharkhand', 'Karnataka',
  'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram',
  'Nagaland', 'Odisha', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu',
  'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal',
  'Delhi', 'Jammu and Kashmir', 'Ladakh', 'Puducherry', 'Chandigarh'
];

const ROOF_TYPES = [
  { value: 'Flat', label: 'Flat Roof' },
  { value: 'Sloped', label: 'Sloped Roof' },
  { value: 'Gable', label: 'Gable Roof' },
  { value: 'Hip', label: 'Hip Roof' }
];

const ROOF_MATERIALS = [
  { value: 'RCC', label: 'RCC (Concrete)' },
  { value: 'Metal', label: 'Metal Sheet' },
  { value: 'Tile', label: 'Tile' },
  { value: 'Asbestos', label: 'Asbestos' },
  { value: 'Thatched', label: 'Thatched' }
];

export function AuthModal({ isOpen, onClose, initialMode = 'login' }: AuthModalProps) {
  const { login, signup, demoLogin, error, clearError, loading } = useAuth();
  const [mode, setMode] = useState<'login' | 'signup'>(initialMode);
  const [step, setStep] = useState(1);
  const [showPassword, setShowPassword] = useState(false);
  
  // Form data
  const [formData, setFormData] = useState<CreateUserData>({
    email: '',
    password: '',
    name: '',
    pincode: '',
    state: '',
    district: '',
    n_members: 4,
    catchment_area: 100,
    farmland_area: 0,
    roof_type: 'Flat',
    roof_material: 'RCC',
    budget: 10000
  });

  // Reset on mode change
  useEffect(() => {
    setStep(1);
    clearError();
  }, [mode]);

  // Reset when modal opens
  useEffect(() => {
    if (isOpen) {
      setMode(initialMode);
      setStep(1);
      clearError();
    }
  }, [isOpen, initialMode]);

  if (!isOpen) return null;

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: ['n_members', 'catchment_area', 'farmland_area', 'budget'].includes(name)
        ? parseFloat(value) || 0
        : value
    }));
  };

  const handleDemo = async () => {
    try {
      await demoLogin();
      onClose();
    } catch {
      // Error is handled in context
    }
  };

  const fillDemoValues = () =>
    setFormData({ ...DEMO_DATA, email: `demo+${Date.now().toString(36)}@indra.app` });

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await login(formData.email, formData.password);
      onClose();
    } catch {
      // Error is handled in context
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await signup(formData);
      onClose();
    } catch {
      // Error is handled in context
    }
  };

  const nextStep = () => setStep(prev => Math.min(prev + 1, 3));
  const prevStep = () => setStep(prev => Math.max(prev - 1, 1));

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[100] p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="p-6 border-b border-gray-100" style={{ background: 'linear-gradient(135deg, #0676c8ff, #32a854)' }}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Droplets className="w-8 h-8 text-white" />
              <div>
                <h2 className="text-xl font-bold text-white">
                  {mode === 'login' ? 'Welcome Back!' : 'Join INDRA'}
                </h2>
                <p className="text-white text-opacity-90 text-sm">
                  {mode === 'login' ? 'Login to your Droplet account' : 'Become a Droplet today'}
                </p>
              </div>
            </div>
            <button 
              onClick={onClose}
              className="text-white hover:bg-white hover:bg-opacity-20 p-2 rounded-full transition-all"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          
          {/* Progress indicator for signup */}
          {mode === 'signup' && (
            <div className="flex gap-2 mt-4">
              {[1, 2, 3].map(i => (
                <div
                  key={i}
                  className={`flex-1 h-1 rounded-full transition-all ${
                    i <= step ? 'bg-white' : 'bg-white bg-opacity-30'
                  }`}
                />
              ))}
            </div>
          )}
        </div>

        {/* Content */}
        <div className="p-6">
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              {error}
            </div>
          )}

          <div className="mb-4 flex flex-col gap-2">
            <button
              type="button"
              onClick={handleDemo}
              disabled={loading}
              className="w-full py-2.5 rounded-lg border-2 border-blue-500 text-blue-700 font-semibold hover:bg-blue-50 disabled:opacity-50"
            >
              Continue with demo account
            </button>
            {mode === 'signup' && (
              <button type="button" onClick={fillDemoValues} className="text-sm text-blue-700 underline self-start">
                Fill the form with demo values
              </button>
            )}
          </div>

          {mode === 'login' ? (
            // Login Form
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Email</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    type="email"
                    name="email"
                    required
                    value={formData.email}
                    onChange={handleInputChange}
                    className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="your@email.com"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Password</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    name="password"
                    required
                    value={formData.password}
                    onChange={handleInputChange}
                    className="w-full pl-10 pr-12 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="••••••••"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 rounded-lg font-semibold text-white flex items-center justify-center gap-2 hover:opacity-90 transition-all disabled:opacity-50"
                style={{ backgroundColor: '#0676c8ff' }}
              >
                {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Login'}
              </button>
            </form>
          ) : (
            // Signup Form with Steps
            <form onSubmit={handleSignup}>
              {/* Step 1: Account Details */}
              {step === 1 && (
                <div className="space-y-4">
                  <h3 className="font-semibold text-gray-800 mb-4">Account Details</h3>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Full Name</label>
                    <div className="relative">
                      <User className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                      <input
                        type="text"
                        name="name"
                        required
                        value={formData.name}
                        onChange={handleInputChange}
                        className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        placeholder="Your full name"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Email</label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                      <input
                        type="email"
                        name="email"
                        required
                        value={formData.email}
                        onChange={handleInputChange}
                        className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        placeholder="your@email.com"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Password</label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                      <input
                        type={showPassword ? 'text' : 'password'}
                        name="password"
                        required
                        minLength={6}
                        value={formData.password}
                        onChange={handleInputChange}
                        className="w-full pl-10 pr-12 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        placeholder="Min 6 characters"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                      >
                        {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                      </button>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={nextStep}
                    className="w-full py-3 rounded-lg font-semibold text-white flex items-center justify-center gap-2 hover:opacity-90 transition-all"
                    style={{ backgroundColor: '#0676c8ff' }}
                  >
                    Continue
                  </button>
                </div>
              )}

              {/* Step 2: Location Details */}
              {step === 2 && (
                <div className="space-y-4">
                  <h3 className="font-semibold text-gray-800 mb-4">Location Details</h3>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Pincode <span className="text-red-500">*</span>
                    </label>
                    <div className="relative">
                      <MapPin className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                      <input
                        type="text"
                        name="pincode"
                        required
                        maxLength={6}
                        pattern="[0-9]{6}"
                        value={formData.pincode}
                        onChange={handleInputChange}
                        className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        placeholder="6-digit pincode (e.g., 110001)"
                      />
                    </div>
                    <p className="text-xs text-gray-500 mt-1">
                      Pincode is used to fetch GIS data for water management & crop suggestions
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">State</label>
                    <div className="relative">
                      <MapPin className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                      <select
                        name="state"
                        required
                        value={formData.state}
                        onChange={handleInputChange}
                        className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
                      >
                        <option value="">Select State</option>
                        {INDIAN_STATES.map(state => (
                          <option key={state} value={state}>{state}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">District</label>
                    <input
                      type="text"
                      name="district"
                      required
                      value={formData.district}
                      onChange={handleInputChange}
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="e.g., South Delhi"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Number of Family Members</label>
                    <div className="relative">
                      <Users className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                      <input
                        type="number"
                        name="n_members"
                        required
                        min={1}
                        value={formData.n_members}
                        onChange={handleInputChange}
                        className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>
                  </div>

                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={prevStep}
                      className="flex-1 py-3 rounded-lg font-semibold border-2 hover:bg-gray-50 transition-all"
                      style={{ borderColor: '#0676c8ff', color: '#0676c8ff' }}
                    >
                      Back
                    </button>
                    <button
                      type="button"
                      onClick={nextStep}
                      className="flex-1 py-3 rounded-lg font-semibold text-white hover:opacity-90 transition-all"
                      style={{ backgroundColor: '#0676c8ff' }}
                    >
                      Continue
                    </button>
                  </div>
                </div>
              )}

              {/* Step 3: Property Details */}
              {step === 3 && (
                <div className="space-y-4">
                  <h3 className="font-semibold text-gray-800 mb-4">Property Details</h3>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Catchment Area (m²)</label>
                      <input
                        type="number"
                        name="catchment_area"
                        required
                        min={0}
                        value={formData.catchment_area}
                        onChange={handleInputChange}
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Farmland (m²)</label>
                      <input
                        type="number"
                        name="farmland_area"
                        min={0}
                        value={formData.farmland_area}
                        onChange={handleInputChange}
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Roof Type</label>
                    <select
                      name="roof_type"
                      value={formData.roof_type}
                      onChange={handleInputChange}
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
                    >
                      {ROOF_TYPES.map(type => (
                        <option key={type.value} value={type.value}>{type.label}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Roof Material</label>
                    <select
                      name="roof_material"
                      value={formData.roof_material}
                      onChange={handleInputChange}
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
                    >
                      {ROOF_MATERIALS.map(mat => (
                        <option key={mat.value} value={mat.value}>{mat.label}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      RWH Budget (₹)
                      <span className="text-xs text-gray-500 ml-2">Typical: ₹8,000 - ₹15,000</span>
                    </label>
                    <input
                      type="range"
                      name="budget"
                      min={500}
                      max={20000}
                      step={500}
                      value={formData.budget}
                      onChange={handleInputChange}
                      className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                      style={{ accentColor: '#0676c8ff' }}
                    />
                    <div className="flex justify-between text-xs text-gray-400 mt-1">
                      <span>₹500</span>
                      <span className="text-base font-bold" style={{ color: '#0676c8ff' }}>
                        ₹{formData.budget.toLocaleString('en-IN')}
                      </span>
                      <span>₹20,000</span>
                    </div>
                    <p className="text-xs text-gray-500 mt-2 text-center">
                      Tip: Basic RWH systems cost Rs.8,000-15,000 with Rs.500-2,000 annual maintenance
                    </p>
                  </div>

                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={prevStep}
                      className="flex-1 py-3 rounded-lg font-semibold border-2 hover:bg-gray-50 transition-all"
                      style={{ borderColor: '#0676c8ff', color: '#0676c8ff' }}
                    >
                      Back
                    </button>
                    <button
                      type="submit"
                      disabled={loading}
                      className="flex-1 py-3 rounded-lg font-semibold text-white flex items-center justify-center gap-2 hover:opacity-90 transition-all disabled:opacity-50"
                      style={{ backgroundColor: '#32a854' }}
                    >
                      {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Create Account'}
                    </button>
                  </div>
                </div>
              )}
            </form>
          )}

          {/* Toggle between Login/Signup */}
          <div className="mt-6 pt-4 border-t border-gray-100 text-center">
            <p className="text-gray-600">
              {mode === 'login' ? "Don't have an account?" : 'Already a Droplet?'}
              <button
                type="button"
                onClick={() => setMode(mode === 'login' ? 'signup' : 'login')}
                className="ml-2 font-semibold hover:underline"
                style={{ color: '#0676c8ff' }}
              >
                {mode === 'login' ? 'Sign Up' : 'Login'}
              </button>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
