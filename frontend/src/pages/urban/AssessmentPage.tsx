import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Droplets, MapPin, Home, IndianRupee,
  ArrowRight, Loader2, CheckCircle2, AlertCircle,
  Save, LogIn,
  Layers, Wrench, ChevronRight,
  Settings, ArrowLeft, Users, Maximize2
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { createAssessment, updateUserProfile } from '../../lib/firestore';
import { api, errorMessage } from '../../lib/api';
import type { AssessmentResult } from '../../types/assessment';
import { AlertList, HazardCard } from '../../components/climate/Hazards';

export function AssessmentPage() {
  const navigate = useNavigate();
  const { user, userProfile, refreshUserProfile } = useAuth();
  const [loading, setLoading] = useState(false);
  const [savingToDb, setSavingToDb] = useState(false);
  const [savedToDb, setSavedToDb] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AssessmentResult | null>(null);


  // Editable assessment fields
  const [propertyName, setPropertyName] = useState(userProfile?.name || '');
  const [nMembers, setNMembers] = useState(userProfile?.n_members || 4);
  const [catchmentArea, setCatchmentArea] = useState(userProfile?.catchment_area || 100);
  const [farmlandArea, setFarmlandArea] = useState(userProfile?.farmland_area || 0);
  const [roofMaterial, setRoofMaterial] = useState(userProfile?.roof_material || 'Concrete');
  const [roofType, setRoofType] = useState(userProfile?.roof_type || 'Flat');
  const [editedPincode, setEditedPincode] = useState(userProfile?.pincode || '');
  const [editedBudget, setEditedBudget] = useState(userProfile?.budget || 10000);
  const [savingProfile, setSavingProfile] = useState(false);
  const [isEditingProfile, setIsEditingProfile] = useState(false);

  // Sync local state with userProfile
  useEffect(() => {
    if (userProfile) {
      setPropertyName(userProfile.name || '');
      setNMembers(userProfile.n_members || 4);
      setCatchmentArea(userProfile.catchment_area || 100);
      setFarmlandArea(userProfile.farmland_area || 0);
      setRoofMaterial(userProfile.roof_material || 'Concrete');
      setRoofType(userProfile.roof_type || 'Flat');
      setEditedPincode(userProfile.pincode || '');
      setEditedBudget(userProfile.budget || 10000);
    }
  }, [userProfile]);


  // Save all assessment fields to Firebase
  const handleSaveProfile = async () => {
    if (!user || !editedPincode || editedPincode.length !== 6) {
      setError('Please enter a valid 6-digit pincode');
      return;
    }
    setSavingProfile(true);
    try {
      await updateUserProfile(user.uid, {
        name: propertyName,
        n_members: nMembers,
        catchment_area: catchmentArea,
        farmland_area: farmlandArea,
        roof_material: roofMaterial,
        roof_type: roofType,
        pincode: editedPincode,
        budget: editedBudget
      });
      await refreshUserProfile();
      setIsEditingProfile(false);
      setError(null);
    } catch (err) {
      console.error('Error updating profile:', err);
      setError('Failed to update profile');
    } finally {
      setSavingProfile(false);
    }
  };

  const handleSubmit = async () => {
    if (!user || !userProfile) {
      setError('Please login to perform an assessment');
      return;
    }

    if (!userProfile.pincode || userProfile.pincode.length !== 6) {
      setError('Please set your pincode in profile settings first');
      setIsEditingProfile(true);
      return;
    }

    setLoading(true);
    setError(null);
    setSavedToDb(false);

    try {
      const assessmentPayload = {
        name: userProfile.name,
        state: userProfile.state,
        district: userProfile.district,
        pincode: userProfile.pincode,
        n_members: userProfile.n_members,
        catchment_area: userProfile.catchment_area,
        farm_land_area: userProfile.farmland_area || 0,
        roof_type: userProfile.roof_type,
        roof_material: userProfile.roof_material,
        budget: userProfile.budget,
        project_status: 'planning'
      };

      const data = await api<AssessmentResult>('/api/assessment/analyze', { method: 'POST', body: assessmentPayload });
      setResult(data);
      await saveResultToDatabase(data);
    } catch (err) {
      setError(errorMessage(err, 'Assessment failed. Please check your pincode and try again.'));
    } finally {
      setLoading(false);
    }
  };

  const saveResultToDatabase = async (assessmentResult: AssessmentResult) => {
    if (!user || !userProfile) return;

    setSavingToDb(true);
    try {
      await createAssessment({
        userId: user.uid,
        name: userProfile.name,
        state: userProfile.state,
        district: userProfile.district,
        pincode: userProfile.pincode,
        n_members: userProfile.n_members,
        catchment_area: userProfile.catchment_area,
        farmland_area: userProfile.farmland_area || 0,
        roof_type: userProfile.roof_type,
        roof_material: userProfile.roof_material,
        budget: userProfile.budget,
        latitude: assessmentResult.location_data?.latitude || null,
        longitude: assessmentResult.location_data?.longitude || null,
        rwh_type: assessmentResult.rwh_analysis?.rwh_type || '',
        avg_rainfall: assessmentResult.location_data?.total_annual_rainfall || 0,
        cost: assessmentResult.cost_analysis?.total_estimated_cost || 0,
        project_status: 1,
        feasibility_score: assessmentResult.feasibility?.overall_score || 0,
        annual_harvestable_water: assessmentResult.rwh_analysis?.annual_harvestable_water_liters || 0,
        recommended_storage_capacity: assessmentResult.rwh_analysis?.recommended_storage_capacity_liters || 0,
        water_self_sufficiency_days: assessmentResult.rwh_analysis?.water_self_sufficiency_days || 0,
        recommendations: assessmentResult.recommendations || []
      });
      setSavedToDb(true);
    } catch (err) {
      console.error('Error saving to database:', err);
    } finally {
      setSavingToDb(false);
    }
  };

  // Login Required Screen
  if (!user || !userProfile) {
    return (
      <div className="min-h-screen py-12 px-4 flex items-center justify-center" style={{ backgroundColor: '#f8fafc' }}>
        <div className="max-w-md w-full bg-white rounded-3xl shadow-xl p-8 text-center">
          <div className="w-20 h-20 mx-auto mb-6 rounded-full flex items-center justify-center"
            style={{ backgroundColor: '#e6f2fa' }}>
            <LogIn className="w-10 h-10" style={{ color: '#0676c8' }} />
          </div>
          <h2 className="text-2xl font-bold mb-4" style={{ color: '#0676c8' }}>
            Login Required
          </h2>
          <p className="text-gray-600 mb-6">
            Create an account with your location and property details to get a personalized RWH assessment.
          </p>
          <button
            onClick={() => navigate('/')}
            className="w-full py-4 rounded-2xl font-bold text-white hover:opacity-90 transition-all"
            style={{ backgroundColor: '#0676c8' }}
          >
            Go to Home Page
          </button>
        </div>
      </div>
    );
  }

  // Results Screen
  if (result) {
    return (
      <AssessmentResults
        result={result}
        onBack={() => { setResult(null); setSavedToDb(false); }}
        savedToDb={savedToDb}
        savingToDb={savingToDb}
        onSave={() => saveResultToDatabase(result)}
      />
    );
  }

  // Main Assessment Form - Editable fields
  return (
    <div className="min-h-screen" style={{ backgroundColor: '#f8fafc' }}>
      {/* Header */}
      <div style={{ backgroundColor: '#0676c8' }} className="pt-4 pb-8 px-4">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center gap-4 mb-6">
            <button
              onClick={() => navigate('/')}
              className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center hover:bg-white/30 transition-all"
            >
              <ArrowLeft className="w-5 h-5 text-white" />
            </button>
            <h1 className="text-2xl font-bold text-white">New Assessment</h1>
          </div>

          {/* Location Card */}
          <div className="bg-white rounded-2xl p-4 shadow-lg">
            <div className="flex items-center gap-4">
              <div
                className="w-12 h-12 rounded-xl flex items-center justify-center"
                style={{ backgroundColor: '#e6f2fa' }}
              >
                <MapPin className="w-6 h-6" style={{ color: '#0676c8' }} />
              </div>
              <div className="flex-1">
                <p className="text-gray-500 text-sm">Location</p>
                <p className="font-semibold text-gray-800">
                  {userProfile.district || 'Set Location'}, {userProfile.state || 'India'}
                </p>
              </div>
              <button
                onClick={() => setIsEditingProfile(true)}
                className="w-10 h-10 rounded-full border border-gray-200 flex items-center justify-center hover:bg-gray-50"
              >
                <Settings className="w-5 h-5 text-gray-500" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Form Content */}
      <div className="max-w-4xl mx-auto px-4 -mt-2">
        <div className="bg-white rounded-3xl shadow-lg p-6 space-y-6">
          {/* Property Name */}
          <div className="flex items-center gap-4 p-4 border border-gray-200 rounded-2xl">
            <Home className="w-6 h-6 text-gray-400" />
            <input
              type="text"
              placeholder="Property Name"
              value={propertyName}
              onChange={(e) => setPropertyName(e.target.value)}
              className="flex-1 outline-none text-gray-700 placeholder-gray-400"
            />
          </div>

          {/* Two Column Inputs */}
          <div className="grid grid-cols-2 gap-4">
            <div className="flex items-center gap-3 p-4 border border-gray-200 rounded-2xl">
              <Users className="w-5 h-5 text-gray-400" />
              <input
                type="number"
                min={1}
                max={20}
                value={nMembers}
                onChange={(e) => setNMembers(Number(e.target.value))}
                className="flex-1 outline-none text-gray-700 bg-transparent"
              />
              <span className="text-gray-400 text-sm ml-1">Dwellers</span>
            </div>
            <div className="flex items-center gap-3 p-4 border border-gray-200 rounded-2xl">
              <Maximize2 className="w-5 h-5 text-gray-400" />
              <input
                type="number"
                min={10}
                max={1000}
                value={catchmentArea}
                onChange={(e) => setCatchmentArea(Number(e.target.value))}
                className="flex-1 outline-none text-gray-700 bg-transparent"
              />
              <span className="text-gray-400 text-sm ml-1">Roof (sqm)</span>
            </div>
          </div>

          {/* Open Space */}
          <div className="flex items-center gap-4 p-4 border border-gray-200 rounded-2xl">
            <Layers className="w-5 h-5 text-gray-400" />
            <input
              type="number"
              min={0}
              max={10000}
              value={farmlandArea}
              onChange={(e) => setFarmlandArea(Number(e.target.value))}
              className="flex-1 outline-none text-gray-700 bg-transparent"
            />
            <span className="text-gray-400 text-sm ml-1">Open Space (sqm)</span>
          </div>

          {/* Roof Material Selection */}
          <div>
            <p className="font-semibold text-gray-800 mb-3">Roof Material</p>
            <div className="flex flex-wrap gap-3">
              {['Concrete', 'Tile', 'Metal', 'Asbestos'].map((material) => (
                <button
                  key={material}
                  type="button"
                  className={`px-6 py-3 rounded-full font-medium transition-all ${roofMaterial === material
                      ? 'text-white shadow-md'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  style={roofMaterial === material ? { backgroundColor: '#0676c8' } : {}}
                  onClick={() => setRoofMaterial(material)}
                >
                  {material}
                </button>
              ))}
            </div>
          </div>

          {/* Edit Profile Modal */}
          {isEditingProfile && (
            <div className="p-4 bg-blue-50 rounded-2xl border border-blue-100">
              <h3 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
                <Settings className="w-5 h-5" style={{ color: '#0676c8' }} />
                Edit Settings
              </h3>
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Pincode</label>
                  <input
                    type="text"
                    value={editedPincode}
                    onChange={(e) => setEditedPincode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:border-blue-500 focus:outline-none"
                    placeholder="6-digit pincode"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Budget: ₹{editedBudget.toLocaleString('en-IN')}
                  </label>
                  <input
                    type="range"
                    min={500}
                    max={20000}
                    step={500}
                    value={editedBudget}
                    onChange={(e) => setEditedBudget(Number(e.target.value))}
                    className="w-full h-2 rounded-lg appearance-none cursor-pointer"
                    style={{ accentColor: '#0676c8' }}
                  />
                </div>
              </div>
              <div className="flex gap-3 mt-4">
                <button
                  onClick={() => setIsEditingProfile(false)}
                  className="px-4 py-2 rounded-xl border border-gray-300 text-gray-600 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveProfile}
                  disabled={savingProfile}
                  className="px-6 py-2 rounded-xl text-white font-semibold flex items-center gap-2"
                  style={{ backgroundColor: '#32a854' }}
                >
                  {savingProfile ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  Save
                </button>
              </div>
            </div>
          )}

          {/* Error Display */}
          {error && (
            <div className="flex items-center gap-3 p-4 bg-red-50 border border-red-200 rounded-xl">
              <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
              <p className="text-red-700">{error}</p>
            </div>
          )}

          {/* Submit Button */}
          <button
            onClick={handleSubmit}
            disabled={loading || !userProfile.pincode}
            className="w-full py-4 rounded-2xl font-bold text-white text-lg flex items-center justify-center gap-2 hover:opacity-90 transition-all disabled:opacity-50 shadow-lg"
            style={{ backgroundColor: '#0676c8' }}
          >
            {loading ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Analyzing...
              </>
            ) : (
              <>
                Start Analysis
                <ArrowRight className="w-5 h-5" />
              </>
            )}
          </button>

          {!userProfile.pincode && (
            <p className="text-center text-amber-600 text-sm font-medium flex items-center justify-center gap-2">
              <AlertCircle className="w-4 h-4" />
              Set your pincode to enable assessment
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// ==================== RESULTS COMPONENT ====================
interface AssessmentResultsProps {
  result: AssessmentResult;
  onBack: () => void;
  savedToDb: boolean;
  savingToDb: boolean;
  onSave: () => void;
}

function AssessmentResults({ result, onBack, savedToDb, savingToDb, onSave }: AssessmentResultsProps) {
  const { feasibility, cost_analysis, rwh_analysis, recommendations, climate } = result;
  const navigate = useNavigate();

  const getFeasibilityColor = (score: number) => {
    if (score >= 80) return '#22c55e';
    if (score >= 65) return '#0676c8';
    if (score >= 50) return '#f59e0b';
    return '#ef4444';
  };

  const getGradient = (score: number) => {
    if (score >= 80) return 'linear-gradient(180deg, #22c55e 0%, #16a34a 100%)';
    if (score >= 65) return 'linear-gradient(180deg, #0676c8 0%, #0284c7 100%)';
    if (score >= 50) return 'linear-gradient(180deg, #f59e0b 0%, #d97706 100%)';
    return 'linear-gradient(180deg, #ef4444 0%, #dc2626 100%)';
  };

  const score = feasibility?.overall_score || 0;

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#f8fafc' }}>
      {/* Dynamic Color Header based on Score */}
      <div
        className="pt-4 pb-32 px-4"
        style={{ background: getGradient(score) }}
      >
        <div className="max-w-4xl mx-auto">
          {/* Navigation */}
          <div className="flex items-center justify-between mb-8">
            <button
              onClick={onBack}
              className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center hover:bg-white/30 transition-all"
            >
              <ArrowLeft className="w-5 h-5 text-white" />
            </button>
            <h1 className="text-xl font-bold text-white">Report Details</h1>
            <div className="w-10" />
          </div>

          {/* Score Circle - Centered */}
          <div className="flex justify-center">
            <div className="relative w-44 h-44">
              {/* White background circle */}
              <div className="absolute inset-0 rounded-full bg-white shadow-xl" />

              {/* Wave animation */}
              <svg className="absolute inset-0 w-full h-full rounded-full overflow-hidden" viewBox="0 0 100 100">
                <defs>
                  <clipPath id="circleClip">
                    <circle cx="50" cy="50" r="48" />
                  </clipPath>
                </defs>
                <g clipPath="url(#circleClip)">
                  <rect x="0" y={100 - score} width="100" height={score} fill={getFeasibilityColor(score)} opacity="0.2" />
                  <path
                    d={`M0 ${100 - score + 5} Q25 ${100 - score - 5}, 50 ${100 - score + 5} T100 ${100 - score + 5} V100 H0 Z`}
                    fill={getFeasibilityColor(score)}
                    opacity="0.4"
                  >
                    <animate
                      attributeName="d"
                      values={`M0 ${100 - score + 5} Q25 ${100 - score - 5}, 50 ${100 - score + 5} T100 ${100 - score + 5} V100 H0 Z;M0 ${100 - score + 5} Q25 ${100 - score + 10}, 50 ${100 - score + 5} T100 ${100 - score + 5} V100 H0 Z;M0 ${100 - score + 5} Q25 ${100 - score - 5}, 50 ${100 - score + 5} T100 ${100 - score + 5} V100 H0 Z`}
                      dur="3s"
                      repeatCount="indefinite"
                    />
                  </path>
                </g>
              </svg>

              {/* Score Text */}
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span
                  className="text-5xl font-bold"
                  style={{ color: getFeasibilityColor(score) }}
                >
                  {score}%
                </span>
                <span className="text-gray-500 text-sm">Feasibility</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Content Cards */}
      <div className="max-w-4xl mx-auto px-4 -mt-16 pb-8 space-y-4">
        {/* Description Card */}
        <div className="bg-white rounded-2xl shadow-lg p-6">
          <p className="text-gray-600 text-center">
            {feasibility?.recommendation || `Overall feasibility is ${score >= 50 ? 'favourable' : 'challenging'} for your rainfall, roof and budget.`}
          </p>
        </div>

        {/* Harvesting Potential Card */}
        <div className="bg-white rounded-2xl shadow-lg p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ backgroundColor: '#e6f2fa' }}>
              <Droplets className="w-5 h-5" style={{ color: '#0676c8' }} />
            </div>
            <h3 className="font-bold text-gray-800">Harvesting Potential</h3>
          </div>
          <div className="border-t border-gray-100 pt-4 space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-gray-600">Annual Runoff</span>
              <span className="font-bold" style={{ color: '#0676c8' }}>
                {(rwh_analysis?.annual_harvestable_water_liters || 0).toLocaleString()} L
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-600">Tank Size</span>
              <span className="font-bold text-gray-800">
                {(rwh_analysis?.recommended_storage_capacity_liters || 0).toLocaleString()} L
              </span>
            </div>
            <p className="text-gray-400 text-sm italic pt-2">
              Note: Based on average rainfall and standard water demand for non-potable uses.
            </p>
          </div>
        </div>

        {/* Climate resilience: the monsoon-flood / summer-scarcity view of this property */}
        {climate && (
          <div className="bg-white rounded-2xl shadow-lg p-6">
            <h3 className="font-bold text-gray-800 mb-1">Climate resilience</h3>
            <p className="text-sm text-gray-500 mb-4">
              {climate.season.label}. {rwh_analysis.kept_off_the_street_liters > 0 &&
                `Your roof can keep about ${Math.round(rwh_analysis.kept_off_the_street_liters).toLocaleString('en-IN')} L off the street each rainy season.`}
            </p>
            <div className="grid gap-4 md:grid-cols-3">
              {(['flood', 'drought', 'heat'] as const).map((h) => (
                <HazardCard key={h} hazard={h} data={climate.scores[h]} highlighted={climate.season.focus === h} />
              ))}
            </div>
            {climate.alerts.length > 0 && (
              <div className="mt-4">
                <AlertList alerts={climate.alerts} empty="" />
              </div>
            )}
            {rwh_analysis.recharge_pit_recommended && (
              <p className="mt-4 rounded-xl bg-blue-50 p-3 text-sm text-blue-800">
                A recharge pit is recommended here: it lets monsoon surplus soak into the ground instead of flooding the street.
              </p>
            )}
          </div>
        )}

        {/* Technical Solution Card */}
        <div className="bg-white rounded-2xl shadow-lg p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ backgroundColor: '#f3e8ff' }}>
              <Wrench className="w-5 h-5" style={{ color: '#8b5cf6' }} />
            </div>
            <h3 className="font-bold text-gray-800">Technical Solution</h3>
          </div>
          <div className="border-t border-gray-100 pt-4 space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-gray-600">System Type</span>
              <span className="font-bold" style={{ color: '#0676c8' }}>
                {rwh_analysis?.rwh_type || 'Rooftop Collection'}
              </span>
            </div>
            {rwh_analysis?.system_type_reason && (
              <p className="text-sm text-gray-500 italic bg-blue-50 p-2 rounded-lg">
                {rwh_analysis.system_type_reason}
              </p>
            )}
            <div className="flex justify-between items-center">
              <span className="text-gray-600">Feasible</span>
              <span className="font-bold text-gray-800">{score >= 50 ? 'Yes' : 'Challenging'}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-600">Installation</span>
              <span className="font-bold text-gray-800">
                {rwh_analysis?.installation_type?.replace('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase()) || 'Above Ground'}
              </span>
            </div>

            {/* Tank Dimensions from LLM */}
            {rwh_analysis?.tank_dimensions && (
              <div className="pt-2 bg-gray-50 rounded-xl p-4">
                <p className="text-gray-700 font-semibold mb-3">Tank Specifications:</p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="text-center p-2 bg-white rounded-lg">
                    <p className="text-gray-500 text-xs">Height</p>
                    <p className="font-bold text-lg" style={{ color: '#0676c8' }}>
                      {rwh_analysis.tank_dimensions.height_meters}m
                    </p>
                  </div>
                  <div className="text-center p-2 bg-white rounded-lg">
                    <p className="text-gray-500 text-xs">Diameter</p>
                    <p className="font-bold text-lg" style={{ color: '#0676c8' }}>
                      {rwh_analysis.tank_dimensions.diameter_meters}m
                    </p>
                  </div>
                  <div className="text-center p-2 bg-white rounded-lg">
                    <p className="text-gray-500 text-xs">Capacity</p>
                    <p className="font-bold text-lg" style={{ color: '#22c55e' }}>
                      {(rwh_analysis.tank_dimensions.capacity_liters || 0).toLocaleString()}L
                    </p>
                  </div>
                  <div className="text-center p-2 bg-white rounded-lg">
                    <p className="text-gray-500 text-xs">Material</p>
                    <p className="font-bold text-sm text-gray-800">
                      {rwh_analysis.tank_dimensions.material_recommended || 'Plastic'}
                    </p>
                  </div>
                </div>
                {rwh_analysis.dimension_reasoning && (
                  <p className="text-xs text-gray-500 mt-3 italic">
                    {rwh_analysis.dimension_reasoning}
                  </p>
                )}
              </div>
            )}

            {/* Structural Notes */}
            {rwh_analysis?.structural_notes && (
              <div className="flex items-start gap-2 p-3 bg-amber-50 rounded-xl">
                <AlertCircle className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
                <p className="text-sm text-amber-700">{rwh_analysis.structural_notes}</p>
              </div>
            )}

            {/* Additional Components */}
            {rwh_analysis?.additional_components && rwh_analysis.additional_components.length > 0 && (
              <div className="pt-2">
                <p className="text-gray-600 text-sm mb-2">Required Components:</p>
                <div className="flex flex-wrap gap-2">
                  {rwh_analysis.additional_components.map((comp, idx) => (
                    <span key={idx} className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-xs font-medium">
                      {comp.replace('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Cost Analysis Card */}
        <div className="bg-white rounded-2xl shadow-lg p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ backgroundColor: '#dcfce7' }}>
              <IndianRupee className="w-5 h-5" style={{ color: '#22c55e' }} />
            </div>
            <h3 className="font-bold text-gray-800">Cost Analysis</h3>
          </div>
          <div className="border-t border-gray-100 pt-4 space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-gray-600">Estimated Cost</span>
              <span className="font-bold" style={{ color: '#22c55e' }}>
                ₹{(cost_analysis?.total_estimated_cost || 0).toLocaleString()}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-600">Annual Maintenance</span>
              <span className="font-bold text-gray-800">
                ₹{(cost_analysis?.annual_maintenance ?? 0).toLocaleString()}/yr
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-600">Payback Period</span>
              <span className="font-bold text-gray-800">
                {cost_analysis?.payback_estimate_years ?? '-'} years
              </span>
            </div>
          </div>
        </div>

        {/* Recommendations */}
        {recommendations && recommendations.length > 0 && (
          <div className="bg-white rounded-2xl shadow-lg p-6">
            <h3 className="font-bold text-gray-800 mb-4">Recommendations</h3>
            <div className="space-y-3">
              {recommendations.slice(0, 6).map((rec, index) => (
                <div key={index} className="flex items-start gap-3 p-3 rounded-xl bg-gray-50">
                  <CheckCircle2 className="w-5 h-5 mt-0.5 flex-shrink-0" style={{ color: '#22c55e' }} />
                  <p className="text-gray-700 text-sm">{rec}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex gap-3 pt-4">
          {!savedToDb && (
            <button
              onClick={onSave}
              disabled={savingToDb}
              className="flex-1 py-4 rounded-2xl font-bold text-white flex items-center justify-center gap-2 hover:opacity-90 transition-all"
              style={{ backgroundColor: '#22c55e' }}
            >
              {savingToDb ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
              Save Report
            </button>
          )}
          <button
            onClick={() => navigate('/vendors')}
            className="flex-1 py-4 rounded-2xl font-bold border-2 flex items-center justify-center gap-2 hover:bg-gray-50 transition-all"
            style={{ borderColor: '#0676c8', color: '#0676c8' }}
          >
            Find Vendors
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>

        {savedToDb && (
          <div className="flex items-center justify-center gap-2 text-green-600 font-medium">
            <CheckCircle2 className="w-5 h-5" />
            Report saved successfully
          </div>
        )}
      </div>
    </div>
  );
}
