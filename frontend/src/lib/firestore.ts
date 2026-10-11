import { 
  collection, 
  doc, 
  setDoc, 
  getDoc, 
  getDocs, 
  updateDoc, 
  deleteDoc, 
  query, 
  where, 
  orderBy,
  limit,
  arrayUnion,
  arrayRemove,
  increment,
  serverTimestamp
} from 'firebase/firestore';
import { db } from './firebase';
import { addLocalAssessment, loadLocalAssessments, loadLocalProfile, patchLocalAssessment, saveLocalProfile } from './localStore';
import { UserProfile, AssessmentData, CommunityPost, PostComment, NearbyDroplet, CommunityStats, ReactionType, PostReaction } from '../types/database';

// Collection names
const USERS_COLLECTION = 'users';
const ASSESSMENTS_COLLECTION = 'assessments';
const POSTS_COLLECTION = 'community_posts';
const COMMENTS_COLLECTION = 'post_comments';

// ==================== POST OPERATIONS ====================

/**
 * Create a post (text only - image upload disabled)
 */
export async function createPostWithImages(
  data: Omit<CommunityPost, 'id' | 'likes' | 'likeCount' | 'reactions' | 'reactionCount' | 'commentCount' | 'imageUrls' | 'createdAt' | 'updatedAt'>
): Promise<string> {
  // Create the post document
  const postRef = doc(collection(db, POSTS_COLLECTION));
  const postId = postRef.id;
  
  // Save the post (no images)
  await setDoc(postRef, {
    ...data,
    imageUrls: [],
    likes: [],
    likeCount: 0,
    reactions: { like: [], love: [], celebrate: [], insightful: [], curious: [] },
    reactionCount: 0,
    commentCount: 0,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
  
  return postId;
}

// ==================== USER PROFILE OPERATIONS ====================

/**
 * Create a new user profile in Firestore
 */
export async function createUserProfile(
  uid: string, 
  data: Omit<UserProfile, 'uid' | 'createdAt' | 'updatedAt'>
): Promise<void> {
  try {
    await setDoc(doc(db, USERS_COLLECTION, uid), { ...data, uid, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
  } catch (err) {
    console.warn('Firestore refused the profile write; keeping it on this device.', err);
  }
  saveLocalProfile(uid, data); // always mirror locally so the app works if Firestore is locked down
}

/**
 * Get user profile by UID
 */
export async function getUserProfile(uid: string): Promise<UserProfile | null> {
  try {
    const userSnap = await getDoc(doc(db, USERS_COLLECTION, uid));
    if (userSnap.exists()) {
      const data = userSnap.data();
      return {
        ...data,
        createdAt: data.createdAt?.toDate() || new Date(),
        updatedAt: data.updatedAt?.toDate() || new Date()
      } as UserProfile;
    }
  } catch (err) {
    console.warn('Firestore refused the profile read; using the on-device copy.', err);
  }
  return loadLocalProfile(uid);
}

/**
 * Update user profile
 */
export async function updateUserProfile(
  uid: string, 
  data: Partial<Omit<UserProfile, 'uid' | 'createdAt' | 'updatedAt'>>
): Promise<void> {
  try {
    await updateDoc(doc(db, USERS_COLLECTION, uid), { ...data, updatedAt: serverTimestamp() });
  } catch (err) {
    console.warn('Firestore refused the profile update; saving on this device.', err);
  }
  saveLocalProfile(uid, data);
}

/**
 * Delete user profile
 */
export async function deleteUserProfile(uid: string): Promise<void> {
  const userRef = doc(db, USERS_COLLECTION, uid);
  await deleteDoc(userRef);
}

// ==================== ASSESSMENT OPERATIONS ====================

/**
 * Create a new assessment
 */
export async function createAssessment(
  data: Omit<AssessmentData, 'id' | 'createdAt' | 'updatedAt'>
): Promise<string> {
  try {
    const assessmentRef = doc(collection(db, ASSESSMENTS_COLLECTION));
    await setDoc(assessmentRef, { ...data, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
    return assessmentRef.id;
  } catch (err) {
    console.warn('Firestore refused the assessment write; saving on this device.', err);
    return addLocalAssessment(data);
  }
}

/**
 * Get assessment by ID
 */
export async function getAssessment(assessmentId: string): Promise<AssessmentData | null> {
  const assessmentRef = doc(db, ASSESSMENTS_COLLECTION, assessmentId);
  const assessmentSnap = await getDoc(assessmentRef);
  
  if (assessmentSnap.exists()) {
    const data = assessmentSnap.data();
    return {
      id: assessmentSnap.id,
      ...data,
      createdAt: data.createdAt?.toDate() || new Date(),
      updatedAt: data.updatedAt?.toDate() || new Date()
    } as AssessmentData;
  }
  return null;
}

/**
 * Get all assessments for a user
 */
export async function getUserAssessments(userId: string): Promise<AssessmentData[]> {
  let remote: AssessmentData[] = [];
  try {
    const q = query(collection(db, ASSESSMENTS_COLLECTION), where('userId', '==', userId), orderBy('createdAt', 'desc'));
    const querySnapshot = await getDocs(q);
    remote = querySnapshot.docs.map(d => {
      const data = d.data();
      return {
        id: d.id,
        ...data,
        createdAt: data.createdAt?.toDate() || new Date(),
        updatedAt: data.updatedAt?.toDate() || new Date()
      } as AssessmentData;
    });
  } catch (err) {
    console.warn('Firestore refused the assessment read; showing on-device assessments.', err);
  }
  return [...loadLocalAssessments(userId), ...remote].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

/**
 * Update assessment
 */
export async function updateAssessment(
  assessmentId: string, 
  data: Partial<Omit<AssessmentData, 'id' | 'userId' | 'createdAt' | 'updatedAt'>>
): Promise<void> {
  if (patchLocalAssessment(assessmentId, data)) return;
  await updateDoc(doc(db, ASSESSMENTS_COLLECTION, assessmentId), { ...data, updatedAt: serverTimestamp() });
}

/**
 * Toggle project status
 */
export async function toggleProjectStatus(assessmentId: string, currentStatus: 0 | 1): Promise<void> {
  const newStatus = currentStatus === 1 ? 0 : 1;
  await updateAssessment(assessmentId, { project_status: newStatus });
}

/**
 * Delete assessment
 */
export async function deleteAssessment(assessmentId: string): Promise<void> {
  if (patchLocalAssessment(assessmentId, null)) return;
  await deleteDoc(doc(db, ASSESSMENTS_COLLECTION, assessmentId));
}

/**
 * Get all active projects (for dashboard)
 */
export async function getActiveProjects(): Promise<AssessmentData[]> {
  const assessmentsRef = collection(db, ASSESSMENTS_COLLECTION);
  const q = query(
    assessmentsRef, 
    where('project_status', '==', 1),
    orderBy('createdAt', 'desc')
  );
  
  const querySnapshot = await getDocs(q);
  return querySnapshot.docs.map(doc => {
    const data = doc.data();
    return {
      id: doc.id,
      ...data,
      createdAt: data.createdAt?.toDate() || new Date(),
      updatedAt: data.updatedAt?.toDate() || new Date()
    } as AssessmentData;
  });
}

/**
 * Get assessments by state (for community clustering)
 */
export async function getAssessmentsByState(state: string): Promise<AssessmentData[]> {
  const assessmentsRef = collection(db, ASSESSMENTS_COLLECTION);
  const q = query(
    assessmentsRef, 
    where('state', '==', state),
    orderBy('createdAt', 'desc')
  );
  
  const querySnapshot = await getDocs(q);
  return querySnapshot.docs.map(doc => {
    const data = doc.data();
    return {
      id: doc.id,
      ...data,
      createdAt: data.createdAt?.toDate() || new Date(),
      updatedAt: data.updatedAt?.toDate() || new Date()
    } as AssessmentData;
  });
}

// ==================== COMMUNITY POST OPERATIONS ====================

/**
 * Create a new community post
 */
export async function createPost(
  data: Omit<CommunityPost, 'id' | 'likes' | 'likeCount' | 'reactions' | 'reactionCount' | 'commentCount' | 'createdAt' | 'updatedAt'>
): Promise<string> {
  const postRef = doc(collection(db, POSTS_COLLECTION));
  await setDoc(postRef, {
    ...data,
    likes: [],
    likeCount: 0,
    reactions: { like: [], love: [], celebrate: [], insightful: [], curious: [] },
    reactionCount: 0,
    commentCount: 0,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
  return postRef.id;
}

/**
 * Get community feed posts with optional filters
 */
export async function getFeedPosts(
  filters?: { state?: string; district?: string; postType?: string },
  maxPosts: number = 50
): Promise<CommunityPost[]> {
  const postsRef = collection(db, POSTS_COLLECTION);
  const q = query(postsRef, orderBy('createdAt', 'desc'), limit(maxPosts));
  
  // Note: Firestore doesn't allow multiple inequality filters
  // So we filter in memory for complex cases
  const querySnapshot = await getDocs(q);
  let posts = querySnapshot.docs.map(doc => {
    const data = doc.data();
    return {
      id: doc.id,
      ...data,
      reactions: data.reactions || { like: [], love: [], celebrate: [], insightful: [], curious: [] },
      reactionCount: data.reactionCount || 0,
      createdAt: data.createdAt?.toDate() || new Date(),
      updatedAt: data.updatedAt?.toDate() || new Date()
    } as CommunityPost;
  });

  // Apply filters in memory
  if (filters?.state) {
    posts = posts.filter(p => p.authorState?.toLowerCase() === filters.state?.toLowerCase());
  }
  if (filters?.district) {
    posts = posts.filter(p => p.authorDistrict?.toLowerCase() === filters.district?.toLowerCase());
  }
  if (filters?.postType && filters.postType !== 'all') {
    posts = posts.filter(p => p.postType === filters.postType);
  }

  return posts;
}

/**
 * Get a single post by ID
 */
export async function getPost(postId: string): Promise<CommunityPost | null> {
  const postRef = doc(db, POSTS_COLLECTION, postId);
  const postSnap = await getDoc(postRef);
  
  if (postSnap.exists()) {
    const data = postSnap.data();
    return {
      id: postSnap.id,
      ...data,
      createdAt: data.createdAt?.toDate() || new Date(),
      updatedAt: data.updatedAt?.toDate() || new Date()
    } as CommunityPost;
  }
  return null;
}

/**
 * Like a post (toggle) - Legacy support
 */
export async function toggleLikePost(postId: string, userId: string): Promise<{ liked: boolean; likeCount: number }> {
  const postRef = doc(db, POSTS_COLLECTION, postId);
  const postSnap = await getDoc(postRef);
  
  if (!postSnap.exists()) {
    throw new Error('Post not found');
  }
  
  const postData = postSnap.data();
  const likes: string[] = postData.likes || [];
  const hasLiked = likes.includes(userId);
  
  if (hasLiked) {
    // Unlike
    await updateDoc(postRef, {
      likes: arrayRemove(userId),
      likeCount: increment(-1),
      updatedAt: serverTimestamp()
    });
    return { liked: false, likeCount: (postData.likeCount || 1) - 1 };
  } else {
    // Like
    await updateDoc(postRef, {
      likes: arrayUnion(userId),
      likeCount: increment(1),
      updatedAt: serverTimestamp()
    });
    return { liked: true, likeCount: (postData.likeCount || 0) + 1 };
  }
}

/**
 * Toggle reaction on a post (new multi-reaction system)
 */
export async function toggleReaction(
  postId: string, 
  userId: string, 
  reactionType: ReactionType
): Promise<{ reacted: boolean; reactions: PostReaction; reactionCount: number }> {
  const postRef = doc(db, POSTS_COLLECTION, postId);
  const postSnap = await getDoc(postRef);
  
  if (!postSnap.exists()) {
    throw new Error('Post not found');
  }
  
  const postData = postSnap.data();
  const reactions: PostReaction = postData.reactions || { like: [], love: [], celebrate: [], insightful: [], curious: [] };
  
  // Check if user already has this reaction
  const hasReaction = reactions[reactionType]?.includes(userId);
  
  // First, remove user from all reactions (can only have one reaction)
  for (const type of Object.keys(reactions)) {
    if (reactions[type]?.includes(userId)) {
      reactions[type] = reactions[type].filter((id: string) => id !== userId);
    }
  }
  
  let reacted = false;
  if (!hasReaction) {
    // Add new reaction
    if (!reactions[reactionType]) reactions[reactionType] = [];
    reactions[reactionType].push(userId);
    reacted = true;
  }
  
  // Calculate new total
  const newReactionCount = Object.values(reactions).reduce((sum, arr) => sum + (arr?.length || 0), 0);
  
  await updateDoc(postRef, {
    reactions,
    reactionCount: newReactionCount,
    updatedAt: serverTimestamp()
  });
  
  return { reacted, reactions, reactionCount: newReactionCount };
}

/**
 * Delete a post and all its comments
 */
export async function deletePost(postId: string): Promise<void> {
  // First, delete all comments for this post
  const commentsRef = collection(db, COMMENTS_COLLECTION);
  const commentsQuery = query(commentsRef, where('postId', '==', postId));
  
  try {
    const commentsSnapshot = await getDocs(commentsQuery);
    
    // Delete all comments in parallel
    const deletePromises = commentsSnapshot.docs.map(commentDoc => 
      deleteDoc(doc(db, COMMENTS_COLLECTION, commentDoc.id))
    );
    await Promise.all(deletePromises);
    
    console.log(`[deletePost] Deleted ${commentsSnapshot.docs.length} comments for post ${postId}`);
  } catch (err) {
    console.error('[deletePost] Error deleting comments:', err);
    // Continue to delete the post even if comments fail
  }
  
  // Then delete the post itself
  const postRef = doc(db, POSTS_COLLECTION, postId);
  await deleteDoc(postRef);
  
  console.log(`[deletePost] Post ${postId} deleted successfully`);
}

// ==================== COMMENT OPERATIONS ====================

/**
 * Add a comment to a post (supports threading)
 */
export async function addComment(
  postId: string,
  data: Omit<PostComment, 'id' | 'postId' | 'reactions' | 'reactionCount' | 'replyCount' | 'createdAt'>
): Promise<string> {
  const commentRef = doc(collection(db, COMMENTS_COLLECTION));
  
  // Build comment data, excluding undefined parentCommentId
  const commentData: Record<string, string | number | string[] | Record<string, string[]> | ReturnType<typeof serverTimestamp>> = {
    authorUid: data.authorUid,
    authorName: data.authorName,
    content: data.content,
    postId,
    reactions: { like: [], love: [], celebrate: [], insightful: [], curious: [] },
    reactionCount: 0,
    replyCount: 0,
    createdAt: serverTimestamp()
  };
  
  // Only include parentCommentId if it's a valid string (not undefined/null)
  if (data.parentCommentId) {
    commentData.parentCommentId = data.parentCommentId;
  }
  
  await setDoc(commentRef, commentData);
  
  // If this is a reply to another comment, increment parent's reply count
  if (data.parentCommentId) {
    const parentRef = doc(db, COMMENTS_COLLECTION, data.parentCommentId);
    await updateDoc(parentRef, {
      replyCount: increment(1)
    });
  }
  
  // Increment comment count on post
  const postRef = doc(db, POSTS_COLLECTION, postId);
  await updateDoc(postRef, {
    commentCount: increment(1),
    updatedAt: serverTimestamp()
  });
  
  return commentRef.id;
}

/**
 * Get ALL comments for a post (for building comment tree in UI)
 */
export async function getPostComments(postId: string): Promise<PostComment[]> {
  const commentsRef = collection(db, COMMENTS_COLLECTION);
  const q = query(
    commentsRef,
    where('postId', '==', postId),
    orderBy('createdAt', 'asc')
  );
  
  try {
    const querySnapshot = await getDocs(q);
    console.log(`[getPostComments] Found ${querySnapshot.docs.length} comments for post ${postId}`);
    
    const allComments = querySnapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        ...data,
        reactions: data.reactions || { like: [], love: [], celebrate: [], insightful: [], curious: [] },
        reactionCount: data.reactionCount || 0,
        replyCount: data.replyCount || 0,
        createdAt: data.createdAt?.toDate() || new Date()
      } as PostComment;
    });
    
    // Return ALL comments - UI will handle the tree structure
    return allComments;
  } catch (error) {
    console.error('[getPostComments] Error fetching comments:', error);
    // Try without orderBy in case index doesn't exist
    try {
      const fallbackQuery = query(
        commentsRef,
        where('postId', '==', postId)
      );
      const fallbackSnapshot = await getDocs(fallbackQuery);
      console.log(`[getPostComments] Fallback found ${fallbackSnapshot.docs.length} comments`);
      
      const allComments = fallbackSnapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          ...data,
          reactions: data.reactions || { like: [], love: [], celebrate: [], insightful: [], curious: [] },
          reactionCount: data.reactionCount || 0,
          replyCount: data.replyCount || 0,
          createdAt: data.createdAt?.toDate() || new Date()
        } as PostComment;
      });
      
      // Sort by createdAt manually
      allComments.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
      return allComments;
    } catch (fallbackError) {
      console.error('[getPostComments] Fallback also failed:', fallbackError);
      return [];
    }
  }
}

/**
 * Get replies to a comment
 */
export async function getCommentReplies(commentId: string): Promise<PostComment[]> {
  const commentsRef = collection(db, COMMENTS_COLLECTION);
  const q = query(
    commentsRef,
    where('parentCommentId', '==', commentId),
    orderBy('createdAt', 'asc')
  );
  
  const querySnapshot = await getDocs(q);
  return querySnapshot.docs.map(doc => {
    const data = doc.data();
    return {
      id: doc.id,
      ...data,
      reactions: data.reactions || {},
      reactionCount: data.reactionCount || 0,
      replyCount: data.replyCount || 0,
      createdAt: data.createdAt?.toDate() || new Date()
    } as PostComment;
  });
}

/**
 * Toggle reaction on a comment
 */
export async function toggleCommentReaction(
  commentId: string, 
  userId: string, 
  reactionType: ReactionType
): Promise<{ reacted: boolean; reactions: PostReaction; reactionCount: number }> {
  const commentRef = doc(db, COMMENTS_COLLECTION, commentId);
  const commentSnap = await getDoc(commentRef);
  
  if (!commentSnap.exists()) {
    throw new Error('Comment not found');
  }
  
  const commentData = commentSnap.data();
  const reactions: PostReaction = commentData.reactions || {};
  
  // Check if user already has this reaction
  const hasReaction = reactions[reactionType]?.includes(userId);
  
  // Remove user from all reactions first
  for (const type of Object.keys(reactions)) {
    if (reactions[type]?.includes(userId)) {
      reactions[type] = reactions[type].filter((id: string) => id !== userId);
    }
  }
  
  let reacted = false;
  if (!hasReaction) {
    if (!reactions[reactionType]) reactions[reactionType] = [];
    reactions[reactionType].push(userId);
    reacted = true;
  }
  
  const newReactionCount = Object.values(reactions).reduce((sum, arr) => sum + (arr?.length || 0), 0);
  
  await updateDoc(commentRef, {
    reactions,
    reactionCount: newReactionCount
  });
  
  return { reacted, reactions, reactionCount: newReactionCount };
}

// ==================== NEARBY DROPLETS (Location-based) ====================

/**
 * Calculate distance between two coordinates (Haversine formula)
 */
function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Earth's radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export interface NearbyDropletsResult {
  droplets: NearbyDroplet[];
  nearbyCount: number;       // Droplets within maxDistance
  totalCount: number;        // All other droplets
  hasMore: boolean;          // More droplets available
  noNearbyFound: boolean;    // Flag to show "no nearby" message
  userLocation?: string;     // User's district/state for display
}

/**
 * Get nearby droplets with pagination - shows ALL droplets sorted by distance
 */
export async function getNearbyDroplets(
  currentUser: { uid: string; latitude?: number; longitude?: number; state?: string; district?: string },
  options: {
    maxDistance?: number;  // km threshold for "nearby"
    page?: number;         // pagination (0-indexed)
    pageSize?: number;     // items per page
  } = {}
): Promise<NearbyDropletsResult> {
  const { maxDistance = 50, page = 0, pageSize = 10 } = options;
  const usersRef = collection(db, USERS_COLLECTION);
  
  // Get all users (in production, use geohashing for efficiency)
  const querySnapshot = await getDocs(usersRef);
  
  const allDroplets: NearbyDroplet[] = [];
  
  querySnapshot.docs.forEach(doc => {
    const data = doc.data();
    if (data.uid === currentUser.uid) return; // Skip current user
    
    let distance: number | undefined;
    
    // Calculate distance if both have coordinates
    if (currentUser.latitude && currentUser.longitude && data.latitude && data.longitude) {
      distance = calculateDistance(
        currentUser.latitude,
        currentUser.longitude,
        data.latitude,
        data.longitude
      );
    }
    
    allDroplets.push({
      uid: data.uid,
      name: data.name || 'Anonymous',
      email: data.email,
      state: data.state || '',
      district: data.district || '',
      n_members: data.n_members || 0,
      catchment_area: data.catchment_area || 0,
      farmland_area: data.farmland_area || 0,
      budget: data.budget || 0,
      latitude: data.latitude,
      longitude: data.longitude,
      distance: distance !== undefined ? Math.round(distance * 10) / 10 : undefined
    });
  });
  
  // Sort ALL droplets by distance (closest first)
  // Those without distance go to the end
  allDroplets.sort((a, b) => {
    if (a.distance !== undefined && b.distance !== undefined) {
      return a.distance - b.distance;
    }
    if (a.distance !== undefined) return -1;
    if (b.distance !== undefined) return 1;
    // Prioritize same district, then same state
    const aDistrict = a.district?.toLowerCase() === currentUser.district?.toLowerCase() ? 0 : 1;
    const bDistrict = b.district?.toLowerCase() === currentUser.district?.toLowerCase() ? 0 : 1;
    if (aDistrict !== bDistrict) return aDistrict - bDistrict;
    const aState = a.state?.toLowerCase() === currentUser.state?.toLowerCase() ? 0 : 1;
    const bState = b.state?.toLowerCase() === currentUser.state?.toLowerCase() ? 0 : 1;
    return aState - bState;
  });
  
  // Count nearby droplets (within maxDistance)
  const nearbyCount = allDroplets.filter(d => d.distance !== undefined && d.distance <= maxDistance).length;
  
  // Paginate
  const startIdx = page * pageSize;
  const paginatedDroplets = allDroplets.slice(startIdx, startIdx + pageSize);
  const hasMore = startIdx + pageSize < allDroplets.length;
  
  // User location for display
  const userLocation = [currentUser.district, currentUser.state].filter(Boolean).join(', ');
  
  return {
    droplets: paginatedDroplets,
    nearbyCount,
    totalCount: allDroplets.length,
    hasMore,
    noNearbyFound: nearbyCount === 0,
    userLocation
  };
}

/**
 * Legacy function - get nearby droplets (simple version)
 */
export async function getNearbyDropletsSimple(
  currentUser: { uid: string; latitude?: number; longitude?: number; state?: string; district?: string },
  maxDistance: number = 100,
  maxResults: number = 20
): Promise<NearbyDroplet[]> {
  const result = await getNearbyDroplets(currentUser, { maxDistance, page: 0, pageSize: maxResults });
  return result.droplets;
}

/**
 * Get all droplets in a specific district
 */
export async function getDropletsByDistrict(
  district: string,
  state?: string
): Promise<NearbyDroplet[]> {
  const usersRef = collection(db, USERS_COLLECTION);
  const q = query(usersRef, where('district', '==', district));
  
  const querySnapshot = await getDocs(q);
  let droplets = querySnapshot.docs.map(doc => {
    const data = doc.data();
    return {
      uid: data.uid,
      name: data.name || 'Anonymous',
      state: data.state || '',
      district: data.district || '',
      n_members: data.n_members || 0,
      catchment_area: data.catchment_area || 0,
      farmland_area: data.farmland_area || 0,
      budget: data.budget || 0,
      latitude: data.latitude,
      longitude: data.longitude
    } as NearbyDroplet;
  });
  
  if (state) {
    droplets = droplets.filter(d => d.state?.toLowerCase() === state.toLowerCase());
  }
  
  return droplets;
}

// ==================== COMMUNITY STATS ====================

/**
 * Get community statistics
 */
export async function getCommunityStats(): Promise<CommunityStats> {
  // Get all users
  const usersSnap = await getDocs(collection(db, USERS_COLLECTION));
  const users = usersSnap.docs.map(d => d.data());
  
  // Get post count
  const postsSnap = await getDocs(collection(db, POSTS_COLLECTION));
  
  // Calculate stats
  const states = new Set<string>();
  const districts = new Set<string>();
  let totalWaterPotential = 0;
  
  users.forEach(user => {
    if (user.state) states.add(user.state);
    if (user.district) districts.add(user.district);
    // Estimate water potential: catchment_area * avg_rainfall * 0.8 / 1000 (KL)
    const rainfall = user.avg_rainfall || 800;
    totalWaterPotential += (user.catchment_area || 0) * rainfall * 0.8 / 1000;
  });
  
  return {
    totalDroplets: users.length,
    totalClusters: Math.ceil(users.length / 10) || 1, // Approximate clustering
    totalPosts: postsSnap.size,
    totalWaterPotentialKL: Math.round(totalWaterPotential),
    activeStates: Array.from(states),
    activeDistricts: Array.from(districts)
  };
}
