import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  User, MapPin, Home, Users, Droplets, Settings, LogOut, 
  Edit2, Save, X, Loader2, Calendar, TrendingUp, 
  CheckCircle2, XCircle, ToggleLeft, ToggleRight, Trash2
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { getUserAssessments, updateUserProfile, toggleProjectStatus, deleteAssessment } from '../../lib/firestore';
import { AssessmentData } from '../../types/database';

export function ProfilePage() {
  const navigate = useNavigate();
  const { user, userProfile, logout, refreshUserProfile, loading: authLoading } = useAuth();
  const { colors } = useTheme();
  
  const [assessments, setAssessments] = useState<AssessmentData[]>([]);
  const [loadingAssessments, setLoadingAssessments] = useState(true);
  const [editMode, setEditMode] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editData, setEditData] = useState({
    name: '',
    pincode: '',
    state: '',
    district: '',
    n_members: 0,
    catchment_area: 0,
    farmland_area: 0,
    roof_type: '',
    roof_material: '',
    budget: 0
  });

  // Redirect if not logged in
  useEffect(() => {
    if (!authLoading && !user) {
      navigate('/');
    }
  }, [user, authLoading, navigate]);

  // Load assessments
  useEffect(() => {
    const loadAssessments = async () => {
      if (user) {
        try {
          const data = await getUserAssessments(user.uid);
          setAssessments(data);
        } catch (err) {
          console.error('Error loading assessments:', err);
        } finally {
          setLoadingAssessments(false);
        }
      }
    };
    loadAssessments();
  }, [user]);

  // Initialize edit data
  useEffect(() => {
    if (userProfile) {
      setEditData({
        name: userProfile.name || '',
        pincode: userProfile.pincode || '',
        state: userProfile.state || '',
        district: userProfile.district || '',
        n_members: userProfile.n_members || 0,
        catchment_area: userProfile.catchment_area || 0,
        farmland_area: userProfile.farmland_area || 0,
        roof_type: userProfile.roof_type || '',
        roof_material: userProfile.roof_material || '',
        budget: userProfile.budget || 0
      });
    }
  }, [userProfile]);

  const handleLogout = async () => {
    try {
      await logout();
      navigate('/');
    } catch (err) {
      console.error('Logout error:', err);
    }
  };

  const handleSaveProfile = async () => {
    if (!user) return;
    setSaving(true);
    try {
      await updateUserProfile(user.uid, editData);
      await refreshUserProfile();
      setEditMode(false);
    } catch (err) {
      console.error('Error saving profile:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleToggleProjectStatus = async (assessmentId: string, currentStatus: 0 | 1) => {
    try {
      await toggleProjectStatus(assessmentId, currentStatus);
      setAssessments(prev => 
        prev.map(a => 
          a.id === assessmentId 
            ? { ...a, project_status: currentStatus === 1 ? 0 : 1 } 
            : a
        )
      );
    } catch (err) {
      console.error('Error toggling status:', err);
    }
  };

  const handleDeleteAssessment = async (assessmentId: string) => {
    if (!window.confirm('Are you sure you want to delete this assessment?')) return;
    try {
      await deleteAssessment(assessmentId);
      setAssessments(prev => prev.filter(a => a.id !== assessmentId));
    } catch (err) {
      console.error('Error deleting assessment:', err);
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-12 h-12 animate-spin" style={{ color: colors.primary }} />
      </div>
    );
  }

  if (!user || !userProfile) {
    return null;
  }

  const activeProjects = assessments.filter(a => a.project_status === 1).length;
  const totalWaterSaved = assessments.reduce((acc, a) => acc + (a.annual_harvestable_water || 0), 0);

  return (
    <div className="min-h-screen py-8 px-4" style={{ backgroundColor: '#f8f9fa' }}>
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-2xl shadow-xl overflow-hidden mb-6">
          <div 
            className="p-8 text-white"
            style={{ background: `linear-gradient(135deg, ${colors.primary}, #32a854)` }}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-20 h-20 bg-white bg-opacity-20 rounded-full flex items-center justify-center">
                  <User className="w-10 h-10" />
                </div>
                <div>
                  <h1 className="text-3xl font-bold">{userProfile.name}</h1>
                  <p className="text-white text-opacity-90">{user.email}</p>
                  <div className="flex items-center gap-2 mt-2">
                    <MapPin className="w-4 h-4" />
                    <span className="text-sm">{userProfile.district}, {userProfile.state} - {userProfile.pincode}</span>
                  </div>
                </div>
              </div>
              <button
                onClick={handleLogout}
                className="flex items-center gap-2 px-4 py-2 bg-white bg-opacity-20 rounded-lg hover:bg-opacity-30 transition-all"
              >
                <LogOut className="w-5 h-5" />
                Logout
              </button>
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-6 bg-gray-50">
            <div className="text-center">
              <div className="text-3xl font-bold" style={{ color: colors.primary }}>
                {assessments.length}
              </div>
              <div className="text-sm text-gray-600">Total Assessments</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold" style={{ color: '#32a854' }}>
                {activeProjects}
              </div>
              <div className="text-sm text-gray-600">Active Projects</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold" style={{ color: colors.primary }}>
                {(totalWaterSaved / 1000).toFixed(1)}K
              </div>
              <div className="text-sm text-gray-600">Liters Harvestable/Year</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold" style={{ color: '#32a854' }}>
                <Droplets className="w-8 h-8 mx-auto" />
              </div>
              <div className="text-sm text-gray-600">Droplet Status</div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Profile Details */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-2xl shadow-xl p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                  <Settings className="w-5 h-5" style={{ color: colors.primary }} />
                  Profile Details
                </h2>
                {!editMode ? (
                  <button
                    onClick={() => setEditMode(true)}
                    className="p-2 rounded-lg hover:bg-gray-100 transition-all"
                    style={{ color: colors.primary }}
                  >
                    <Edit2 className="w-5 h-5" />
                  </button>
                ) : (
                  <div className="flex gap-2">
                    <button
                      onClick={() => setEditMode(false)}
                      className="p-2 rounded-lg hover:bg-gray-100 transition-all text-gray-500"
                    >
                      <X className="w-5 h-5" />
                    </button>
                    <button
                      onClick={handleSaveProfile}
                      disabled={saving}
                      className="p-2 rounded-lg hover:bg-green-50 transition-all"
                      style={{ color: '#32a854' }}
                    >
                      {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                    </button>
                  </div>
                )}
              </div>

              <div className="space-y-4">
                <ProfileField
                  icon={<User className="w-4 h-4" />}
                  label="Name"
                  value={editMode ? editData.name : userProfile.name}
                  editMode={editMode}
                  onChange={(v) => setEditData(p => ({ ...p, name: v }))}
                />
                <ProfileField
                  icon={<MapPin className="w-4 h-4" />}
                  label="Pincode"
                  value={editMode ? editData.pincode : userProfile.pincode}
                  editMode={editMode}
                  type="text"
                  onChange={(v) => {
                    // Only allow 6 digit numbers
                    if (/^\d{0,6}$/.test(v)) {
                      setEditData(p => ({ ...p, pincode: v }));
                    }
                  }}
                />
                <ProfileField
                  icon={<MapPin className="w-4 h-4" />}
                  label="State"
                  value={editMode ? editData.state : userProfile.state}
                  editMode={editMode}
                  onChange={(v) => setEditData(p => ({ ...p, state: v }))}
                />
                <ProfileField
                  icon={<MapPin className="w-4 h-4" />}
                  label="District"
                  value={editMode ? editData.district : userProfile.district}
                  editMode={editMode}
                  onChange={(v) => setEditData(p => ({ ...p, district: v }))}
                />
                <ProfileField
                  icon={<Users className="w-4 h-4" />}
                  label="Family Members"
                  value={editMode ? editData.n_members : userProfile.n_members}
                  editMode={editMode}
                  type="number"
                  onChange={(v) => setEditData(p => ({ ...p, n_members: parseInt(v) || 0 }))}
                />
                <ProfileField
                  icon={<Home className="w-4 h-4" />}
                  label="Catchment Area (m²)"
                  value={editMode ? editData.catchment_area : userProfile.catchment_area}
                  editMode={editMode}
                  type="number"
                  onChange={(v) => setEditData(p => ({ ...p, catchment_area: parseFloat(v) || 0 }))}
                />
                <ProfileField
                  icon={<Home className="w-4 h-4" />}
                  label="Farmland Area (m²)"
                  value={editMode ? editData.farmland_area : userProfile.farmland_area}
                  editMode={editMode}
                  type="number"
                  onChange={(v) => setEditData(p => ({ ...p, farmland_area: parseFloat(v) || 0 }))}
                />
                <ProfileField
                  icon={<Home className="w-4 h-4" />}
                  label="Roof Type"
                  value={editMode ? editData.roof_type : userProfile.roof_type}
                  editMode={editMode}
                  onChange={(v) => setEditData(p => ({ ...p, roof_type: v }))}
                />
                <ProfileField
                  icon={<Home className="w-4 h-4" />}
                  label="Roof Material"
                  value={editMode ? editData.roof_material : userProfile.roof_material}
                  editMode={editMode}
                  onChange={(v) => setEditData(p => ({ ...p, roof_material: v }))}
                />
                
                {/* Budget Field with Slider */}
                <div className="pt-4 border-t">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="text-gray-400">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </div>
                    <div className="text-xs text-gray-500">Budget</div>
                  </div>
                  {editMode ? (
                    <div className="space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-gray-500">₹500</span>
                        <span className="font-bold text-lg" style={{ color: colors.primary }}>
                          ₹{editData.budget.toLocaleString('en-IN')}
                        </span>
                        <span className="text-sm text-gray-500">₹20,000</span>
                      </div>
                      <input
                        type="range"
                        min={500}
                        max={20000}
                        step={500}
                        value={editData.budget}
                        onChange={(e) => setEditData(p => ({ ...p, budget: parseInt(e.target.value) }))}
                        className="w-full h-2 rounded-lg appearance-none cursor-pointer"
                        style={{
                          background: `linear-gradient(to right, ${colors.primary} 0%, ${colors.primary} ${((editData.budget - 500) / (20000 - 500)) * 100}%, #e5e7eb ${((editData.budget - 500) / (20000 - 500)) * 100}%, #e5e7eb 100%)`
                        }}
                      />
                      <p className="text-xs text-gray-400 mt-1">
                        Tip: Typical RWH costs Rs.8,000-15,000 installation
                      </p>
                    </div>
                  ) : (
                    <div className="font-semibold" style={{ color: colors.primary }}>
                      ₹{userProfile.budget.toLocaleString('en-IN')}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Assessments */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-2xl shadow-xl p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                  <TrendingUp className="w-5 h-5" style={{ color: colors.primary }} />
                  Your Assessments
                </h2>
                <button
                  onClick={() => navigate('/assessment')}
                  className="px-4 py-2 rounded-lg text-white font-medium hover:opacity-90 transition-all"
                  style={{ backgroundColor: colors.primary }}
                >
                  New Assessment
                </button>
              </div>

              {loadingAssessments ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-8 h-8 animate-spin" style={{ color: colors.primary }} />
                </div>
              ) : assessments.length === 0 ? (
                <div className="text-center py-12">
                  <Droplets className="w-16 h-16 mx-auto mb-4 text-gray-300" />
                  <h3 className="text-lg font-semibold text-gray-600 mb-2">No Assessments Yet</h3>
                  <p className="text-gray-500 mb-4">Start your water conservation journey today!</p>
                  <button
                    onClick={() => navigate('/assessment')}
                    className="px-6 py-3 rounded-lg text-white font-medium hover:opacity-90 transition-all"
                    style={{ backgroundColor: colors.primary }}
                  >
                    Create Your First Assessment
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  {assessments.map((assessment) => (
                    <AssessmentCard
                      key={assessment.id}
                      assessment={assessment}
                      onToggleStatus={handleToggleProjectStatus}
                      onDelete={handleDeleteAssessment}
                      primaryColor={colors.primary}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Profile Field Component
interface ProfileFieldProps {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  editMode: boolean;
  type?: string;
  onChange: (value: string) => void;
}

function ProfileField({ icon, label, value, editMode, type = 'text', onChange }: ProfileFieldProps) {
  return (
    <div className="flex items-center gap-3">
      <div className="text-gray-400">{icon}</div>
      <div className="flex-1">
        <div className="text-xs text-gray-500">{label}</div>
        {editMode ? (
          <input
            type={type}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="w-full px-2 py-1 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
          />
        ) : (
          <div className="font-medium text-gray-800">{value || '-'}</div>
        )}
      </div>
    </div>
  );
}

// Assessment Card Component
interface AssessmentCardProps {
  assessment: AssessmentData;
  onToggleStatus: (id: string, status: 0 | 1) => void;
  onDelete: (id: string) => void;
  primaryColor: string;
}

function AssessmentCard({ assessment, onToggleStatus, onDelete, primaryColor }: AssessmentCardProps) {
  return (
    <div className="border border-gray-200 rounded-xl p-4 hover:shadow-md transition-all">
      <div className="flex items-start justify-between mb-3">
        <div>
          <h3 className="font-semibold text-gray-800">{assessment.name}</h3>
          <p className="text-sm text-gray-500 flex items-center gap-1">
            <MapPin className="w-3 h-3" />
            {assessment.district}, {assessment.state}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => onToggleStatus(assessment.id!, assessment.project_status)}
            className={`p-2 rounded-lg transition-all ${
              assessment.project_status === 1 
                ? 'bg-green-50 text-green-600' 
                : 'bg-gray-100 text-gray-400'
            }`}
            title={assessment.project_status === 1 ? 'Active - Click to deactivate' : 'Inactive - Click to activate'}
          >
            {assessment.project_status === 1 ? (
              <ToggleRight className="w-5 h-5" />
            ) : (
              <ToggleLeft className="w-5 h-5" />
            )}
          </button>
          <button
            onClick={() => onDelete(assessment.id!)}
            className="p-2 rounded-lg text-red-400 hover:bg-red-50 hover:text-red-600 transition-all"
          >
            <Trash2 className="w-5 h-5" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
        <div>
          <div className="text-gray-500">RWH Type</div>
          <div className="font-medium">{assessment.rwh_type || 'N/A'}</div>
        </div>
        <div>
          <div className="text-gray-500">Annual Harvest</div>
          <div className="font-medium" style={{ color: '#32a854' }}>
            {assessment.annual_harvestable_water?.toLocaleString() || 0} L
          </div>
        </div>
        <div>
          <div className="text-gray-500">Feasibility</div>
          <div className="font-medium" style={{ color: primaryColor }}>
            {assessment.feasibility_score || 0}%
          </div>
        </div>
        <div>
          <div className="text-gray-500">Est. Cost</div>
          <div className="font-medium">₹{assessment.cost?.toLocaleString('en-IN') || 0}</div>
        </div>
      </div>

      <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100">
        <div className="text-xs text-gray-400 flex items-center gap-1">
          <Calendar className="w-3 h-3" />
          {new Date(assessment.createdAt).toLocaleDateString('en-IN', { 
            day: 'numeric', 
            month: 'short', 
            year: 'numeric' 
          })}
        </div>
        <div className={`flex items-center gap-1 text-xs font-medium ${
          assessment.project_status === 1 ? 'text-green-600' : 'text-gray-400'
        }`}>
          {assessment.project_status === 1 ? (
            <>
              <CheckCircle2 className="w-3 h-3" />
              Active Project
            </>
          ) : (
            <>
              <XCircle className="w-3 h-3" />
              Inactive
            </>
          )}
        </div>
      </div>
    </div>
  );
}
