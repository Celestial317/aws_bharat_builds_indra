// User profile and assessment data types for INDRA

export interface UserProfile {
  uid: string;
  email: string;
  name: string;
  pincode: string;
  state: string;
  district: string;
  n_members: number;
  catchment_area: number;
  farmland_area: number;
  roof_type: string;
  roof_material: string;
  budget: number;
  avg_rainfall?: number; // Average annual rainfall in mm (from assessment or GIS data)
  latitude?: number;
  longitude?: number;
  bio?: string;
  createdAt: Date;
  updatedAt: Date;
}

// ==================== COMMUNITY TYPES ====================

// Reaction types for posts
export type ReactionType = 'like' | 'love' | 'celebrate' | 'insightful' | 'curious';

export interface PostReaction {
  [reactionType: string]: string[]; // reaction type -> array of user UIDs
}

export interface CommunityPost {
  id?: string;
  authorUid: string;
  authorName: string;
  authorDistrict: string;
  authorState: string;
  content: string;
  imageUrls?: string[]; // Array of image URLs
  postType: 'general' | 'question' | 'tip' | 'event' | 'achievement';
  tags: string[];
  reactions: PostReaction; // New: multi-reaction support
  reactionCount: number; // Total reactions
  likes: string[]; // Legacy - kept for backwards compatibility
  likeCount: number;
  commentCount: number;
  clusterId?: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface PostComment {
  id?: string;
  postId: string;
  parentCommentId?: string; // For threaded replies
  authorUid: string;
  authorName: string;
  authorAvatar?: string;
  content: string;
  reactions: PostReaction;
  reactionCount: number;
  replyCount: number;
  createdAt: Date;
}

export interface NearbyDroplet {
  uid: string;
  name: string;
  email?: string;
  pincode?: string;
  state: string;
  district: string;
  n_members: number;
  catchment_area: number;
  farmland_area: number;
  budget: number;
  latitude?: number;
  longitude?: number;
  distance?: number; // km from current user
  clusterId?: number;
}

export interface CommunityStats {
  totalDroplets: number;
  totalClusters: number;
  totalPosts: number;
  totalWaterPotentialKL: number;
  activeStates: string[];
  activeDistricts: string[];
}

export interface AssessmentData {
  id?: string;
  userId: string;
  // User-provided fields
  name: string;
  state: string;
  district: string;
  pincode: string;
  n_members: number;
  catchment_area: number;
  farmland_area: number;
  roof_type: string;
  roof_material: string;
  budget: number;
  // System-generated fields
  latitude: number | null;
  longitude: number | null;
  rwh_type: string;
  avg_rainfall: number;
  cost: number;
  project_status: 0 | 1; // 0 = inactive, 1 = active
  // Result data
  feasibility_score: number;
  annual_harvestable_water: number;
  recommended_storage_capacity: number;
  water_self_sufficiency_days: number;
  recommendations: string[];
  // Timestamps
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateUserData {
  email: string;
  password: string;
  name: string;
  pincode: string;
  state: string;
  district: string;
  n_members: number;
  catchment_area: number;
  farmland_area: number;
  roof_type: string;
  roof_material: string;
  budget: number;
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface AssessmentFormData {
  name: string;
  state: string;
  district: string;
  pincode: string;
  n_members: number;
  catchment_area: number;
  farm_land_area: number;
  roof_type: string;
  roof_material: string;
  budget: number;
  project_status: string;
}
