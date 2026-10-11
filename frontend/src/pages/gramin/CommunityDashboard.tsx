/**
 * INDRA Droplet Community - Social Feed
 * Clean, minimalistic social media clone for water conservation
 * Firebase-backed with location-based nearby droplets
 * Features: Reactions, Comment Threads, Distance-based Nearby
 */

import { useEffect, useState, useCallback } from 'react';
import { useTheme } from '../../contexts/ThemeContext';
import { useAuth } from '../../contexts/AuthContext';
import { 
  Users, Droplets, MessageCircle, MapPin, Send, Loader2,
  Plus, RefreshCw, Trash2, Navigation, X,
  BookOpen, Calendar, HelpCircle, Award, ChevronDown,
  Reply
} from 'lucide-react';
import {
  createPostWithImages,
  getFeedPosts,
  toggleReaction,
  deletePost,
  addComment,
  getPostComments,
  getCommentReplies,
  toggleCommentReaction,
  getNearbyDroplets,
  NearbyDropletsResult
} from '../../lib/firestore';
import { CommunityPost, PostComment, ReactionType, PostReaction, UserProfile } from '../../types/database';

// Brand colors
const SECONDARY_COLOR = '#32a854';

// ==================== REACTION CONFIG ====================
const REACTION_CONFIG: Record<ReactionType, { emoji: string; label: string; color: string }> = {
  like: { emoji: '👍', label: 'Like', color: '#3b82f6' },
  love: { emoji: '❤️', label: 'Love', color: '#ef4444' },
  celebrate: { emoji: '🎉', label: 'Celebrate', color: '#f59e0b' },
  insightful: { emoji: '💡', label: 'Insightful', color: '#8b5cf6' },
  curious: { emoji: '🤔', label: 'Curious', color: '#10b981' },
};

// ==================== POST TYPE CONFIG ====================
const POST_TYPE_CONFIG: Record<string, { label: string; color: string; Icon: React.ElementType }> = {
  general: { label: 'General', color: '#6b7280', Icon: MessageCircle },
  question: { label: 'Question', color: '#3b82f6', Icon: HelpCircle },
  achievement: { label: 'Achievement', color: '#10b981', Icon: Award },
  tip: { label: 'Tip', color: '#f59e0b', Icon: BookOpen },
  event: { label: 'Event', color: '#8b5cf6', Icon: Calendar },
};

// ==================== REACTION PICKER COMPONENT ====================
function ReactionPicker({ 
  onSelect, 
  currentReaction,
  isOpen,
  onClose 
}: { 
  onSelect: (type: ReactionType) => void;
  currentReaction?: ReactionType;
  isOpen: boolean;
  onClose: () => void;
}) {
  if (!isOpen) return null;
  
  return (
    <div 
      className="absolute bottom-full left-0 mb-2 bg-white rounded-xl shadow-lg border border-gray-200 p-2 flex gap-1 z-50"
      onMouseLeave={onClose}
    >
      {Object.entries(REACTION_CONFIG).map(([type, config]) => (
        <button
          key={type}
          onClick={() => { onSelect(type as ReactionType); onClose(); }}
          className={`p-2 rounded-lg hover:bg-gray-100 transition-all hover:scale-125 ${
            currentReaction === type ? 'bg-gray-100 ring-2 ring-blue-300' : ''
          }`}
          title={config.label}
        >
          <span className="text-xl">{config.emoji}</span>
        </button>
      ))}
    </div>
  );
}

// ==================== COMMENT WITH REPLIES COMPONENT ====================
function CommentItem({
  comment,
  userId,
  userProfile,
  colors,
  postId,
  onRefresh,
  onLoginRequired,
  level = 0,
  allComments = []
}: {
  comment: PostComment;
  userId?: string;
  userProfile: UserProfile | null;
  colors: { primary: string; background: string; text: string; textSecondary: string };
  postId: string;
  onRefresh?: () => void;
  onLoginRequired?: () => void;
  level?: number;
  allComments?: PostComment[];
}) {
  const [replies, setReplies] = useState<PostComment[]>([]);
  const [showReplies, setShowReplies] = useState(true); // Always show replies by default
  const [loadingReplies, setLoadingReplies] = useState(false);
  const [localReactions, setLocalReactions] = useState<PostReaction>(comment.reactions || {});
  const [localReactionCount, setLocalReactionCount] = useState(comment.reactionCount || 0);
  const [showInlineReply, setShowInlineReply] = useState(false);
  const [inlineReplyText, setInlineReplyText] = useState('');
  const [submittingReply, setSubmittingReply] = useState(false);
  
  // Get replies from allComments (for instant updates) or load from server
  useEffect(() => {
    if (allComments.length > 0) {
      // Filter replies from the passed allComments array
      const directReplies = allComments.filter(c => c.parentCommentId === comment.id);
      if (directReplies.length > 0) {
        setReplies(directReplies);
      }
    } else if ((comment.replyCount || 0) > 0 && level === 0) {
      loadReplies();
    }
  }, [comment.id, comment.replyCount, allComments]);
  
  const loadReplies = async () => {
    if (loadingReplies) return;
    setLoadingReplies(true);
    try {
      const commentReplies = await getCommentReplies(comment.id!);
      setReplies(commentReplies);
    } catch (err) {
      console.error('Error loading replies:', err);
    } finally {
      setLoadingReplies(false);
    }
  };
  
  const toggleReplies = () => {
    if (!showReplies && replies.length === 0) {
      loadReplies();
    }
    setShowReplies(!showReplies);
  };
  
  const handleReaction = async (type: ReactionType) => {
    if (!userId) {
      onLoginRequired?.();
      return;
    }
    try {
      const result = await toggleCommentReaction(comment.id!, userId, type);
      setLocalReactions(result.reactions);
      setLocalReactionCount(result.reactionCount);
    } catch (err) {
      console.error('Error reacting to comment:', err);
    }
  };
  
  const handleInlineReply = async () => {
    if (!userId || !userProfile) {
      onLoginRequired?.();
      return;
    }
    if (!inlineReplyText.trim()) return;
    
    setSubmittingReply(true);
    try {
      const newCommentId = await addComment(postId, {
        authorUid: userId,
        authorName: userProfile.name || 'Anonymous',
        content: inlineReplyText,
        parentCommentId: comment.id
      });
      
      // Immediately add to local replies for instant feedback
      const newReply: PostComment = {
        id: newCommentId,
        postId,
        authorUid: userId,
        authorName: userProfile.name || 'Anonymous',
        content: inlineReplyText,
        parentCommentId: comment.id,
        reactions: { like: [], love: [], celebrate: [], insightful: [], curious: [] },
        reactionCount: 0,
        replyCount: 0,
        createdAt: new Date()
      };
      
      setReplies(prev => [...prev, newReply]);
      setInlineReplyText('');
      setShowInlineReply(false);
      setShowReplies(true);
      
      // Trigger parent refresh for comment count
      if (onRefresh) onRefresh();
    } catch (err) {
      console.error('Error adding reply:', err);
    } finally {
      setSubmittingReply(false);
    }
  };
  
  // Find user's current reaction
  const userReaction = Object.entries(localReactions || {}).find(
    ([, users]) => users?.includes(userId || '')
  )?.[0] as ReactionType | undefined;
  
  // Format time
  const formatTime = (date: Date) => {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    if (diffMins < 1) return 'now';
    if (diffMins < 60) return `${diffMins}m`;
    if (diffHours < 24) return `${diffHours}h`;
    return `${Math.floor(diffMs / 86400000)}d`;
  };
  
  const isNested = level > 0;
  const totalReplies = replies.length + (allComments?.filter(c => c.parentCommentId === comment.id).length || 0);
  
  return (
    <div className="group">
      <div className="flex gap-2.5">
        {/* Avatar */}
        <div 
          className="rounded-full flex items-center justify-center text-white font-semibold flex-shrink-0 shadow-sm"
          style={{ 
            backgroundColor: isNested ? '#9ca3af' : colors.primary,
            width: isNested ? 32 : 40,
            height: isNested ? 32 : 40,
            fontSize: isNested ? '12px' : '14px'
          }}
        >
          {comment.authorName[0]?.toUpperCase()}
        </div>
        
        <div className="flex-1 min-w-0">
          {/* Comment bubble - Facebook style */}
          <div className={`inline-block max-w-full ${isNested ? 'bg-gray-100' : 'bg-gray-100'} rounded-2xl px-4 py-2`}>
            <span className="font-semibold text-gray-900 text-sm">{comment.authorName}</span>
            <p className="text-gray-800 text-sm leading-relaxed mt-0.5">{comment.content}</p>
          </div>
          
          {/* Action row - Facebook/Instagram style */}
          <div className="flex items-center gap-3 mt-1 ml-3 text-xs text-gray-500">
            <span>{formatTime(comment.createdAt)}</span>
            
            {/* Like button */}
            <button 
              onClick={() => {
                if (!userId) { onLoginRequired?.(); return; }
                handleReaction('like');
              }}
              className={`font-semibold hover:underline ${userReaction ? 'text-blue-600' : ''}`}
            >
              {userReaction ? REACTION_CONFIG[userReaction].label : 'Like'}
            </button>
            
            {/* Reply button */}
            {level < 2 && (
              <button 
                onClick={() => {
                  if (!userId) { onLoginRequired?.(); return; }
                  setShowInlineReply(!showInlineReply);
                }}
                className="font-semibold hover:underline"
              >
                Reply
              </button>
            )}
            
            {/* Reaction count */}
            {localReactionCount > 0 && (
              <div className="flex items-center gap-1 ml-auto">
                <span>👍</span>
                <span>{localReactionCount}</span>
              </div>
            )}
          </div>
          
          {/* View replies link */}
          {totalReplies > 0 && !showReplies && level === 0 && (
            <button 
              onClick={toggleReplies}
              className="flex items-center gap-1.5 mt-2 ml-3 text-sm font-medium text-gray-600 hover:text-gray-800"
            >
              {loadingReplies ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  <Reply className="w-4 h-4" />
                  View {totalReplies} {totalReplies === 1 ? 'reply' : 'replies'}
                </>
              )}
            </button>
          )}
          
          {/* Hide replies link */}
          {showReplies && replies.length > 0 && level === 0 && (
            <button 
              onClick={toggleReplies}
              className="flex items-center gap-1.5 mt-2 ml-3 text-sm font-medium text-gray-500 hover:text-gray-700"
            >
              <ChevronDown className="w-4 h-4 rotate-180" />
              Hide replies
            </button>
          )}
          
          {/* Inline reply input - Facebook style */}
          {showInlineReply && (
            <div className="mt-3 flex gap-2 items-center">
              <div 
                className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                style={{ backgroundColor: colors.primary }}
              >
                {userProfile?.name?.[0]?.toUpperCase() || '?'}
              </div>
              <div className="flex-1 flex gap-2 items-center bg-gray-100 rounded-full px-4 py-2">
                <input
                  type="text"
                  value={inlineReplyText}
                  onChange={(e) => setInlineReplyText(e.target.value)}
                  placeholder={`Reply to ${comment.authorName}...`}
                  className="flex-1 bg-transparent text-sm focus:outline-none"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleInlineReply();
                    }
                    if (e.key === 'Escape') {
                      setShowInlineReply(false);
                      setInlineReplyText('');
                    }
                  }}
                />
                {inlineReplyText.trim() && (
                  <button
                    onClick={handleInlineReply}
                    disabled={submittingReply}
                    className="text-blue-600 font-semibold text-sm hover:text-blue-700 disabled:opacity-50"
                  >
                    {submittingReply ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Post'}
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
      
      {/* Nested Replies - Facebook/Instagram style */}
      {showReplies && replies.length > 0 && (
        <div className="mt-2 space-y-3 ml-12">
          {replies.map(reply => (
            <CommentItem
              key={reply.id}
              comment={reply}
              userId={userId}
              userProfile={userProfile}
              colors={colors}
              postId={postId}
              onRefresh={onRefresh}
              onLoginRequired={onLoginRequired}
              allComments={allComments}
              level={level + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ==================== MAIN COMPONENT ====================
export function CommunityDashboard() {
  const { colors } = useTheme();
  const { user, userProfile } = useAuth();
  
  // State
  const [posts, setPosts] = useState<CommunityPost[]>([]);
  const [nearbyResult, setNearbyResult] = useState<NearbyDropletsResult | null>(null);
  const [nearbyPage, setNearbyPage] = useState(0);
  const [loadingMoreNearby, setLoadingMoreNearby] = useState(false);
  const [loading, setLoading] = useState(true);
  const [postFilter, setPostFilter] = useState<string>('all');
  const [newPostContent, setNewPostContent] = useState('');
  const [newPostType, setNewPostType] = useState<string>('general');
  const [showNewPostForm, setShowNewPostForm] = useState(false);
  const [submittingPost, setSubmittingPost] = useState(false);
  const [activeTab, setActiveTab] = useState<'feed' | 'nearby'>('feed');
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [locationLoading, setLocationLoading] = useState(false);
  const [expandedComments, setExpandedComments] = useState<string | null>(null);
  const [comments, setComments] = useState<Record<string, PostComment[]>>({});
  const [newComment, setNewComment] = useState('');
  const [submittingComment, setSubmittingComment] = useState(false);
  const [replyingTo, setReplyingTo] = useState<{ commentId: string; authorName: string } | null>(null);
  

  
  // Reaction picker state
  const [activeReactionPicker, setActiveReactionPicker] = useState<string | null>(null);
  
  // Login prompt state
  const [showLoginPrompt, setShowLoginPrompt] = useState(false);

  // ==================== LOCATION ====================
  const requestLocation = useCallback(() => {
    if (!navigator.geolocation) return;
    
    setLocationLoading(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setUserLocation({
          lat: position.coords.latitude,
          lng: position.coords.longitude
        });
        setLocationLoading(false);
      },
      (error) => {
        console.error('Location error:', error);
        setLocationLoading(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }, []);



  // ==================== DATA FETCHING ====================
  const fetchFeed = useCallback(async () => {
    try {
      const filters: { state?: string; postType?: string } = {};
      if (postFilter !== 'all') filters.postType = postFilter;
      
      const feedPosts = await getFeedPosts(filters, 50);
      setPosts(feedPosts);
    } catch (err) {
      console.error('Error fetching feed:', err);
    }
  }, [postFilter]);

  const fetchNearbyDroplets = useCallback(async (page: number = 0, append: boolean = false) => {
    if (!user || !userProfile) return;
    
    try {
      const result = await getNearbyDroplets(
        {
          uid: user.uid,
          latitude: userLocation?.lat || userProfile.latitude,
          longitude: userLocation?.lng || userProfile.longitude,
          state: userProfile.state,
          district: userProfile.district
        },
        { maxDistance: 50, page, pageSize: 10 }
      );
      
      if (append && nearbyResult) {
        setNearbyResult({
          ...result,
          droplets: [...nearbyResult.droplets, ...result.droplets]
        });
      } else {
        setNearbyResult(result);
      }
    } catch (err) {
      console.error('Error fetching nearby droplets:', err);
    }
  }, [user, userProfile, userLocation, nearbyResult]);
  
  const loadMoreNearby = async () => {
    setLoadingMoreNearby(true);
    const nextPage = nearbyPage + 1;
    await fetchNearbyDroplets(nextPage, true);
    setNearbyPage(nextPage);
    setLoadingMoreNearby(false);
  };

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      await fetchFeed();
      setLoading(false);
    };
    loadData();
  }, [fetchFeed]);

  useEffect(() => {
    if (activeTab === 'nearby') {
      setNearbyPage(0);
      fetchNearbyDroplets(0, false);
    }
  }, [activeTab]);

  useEffect(() => {
    fetchFeed();
  }, [postFilter, fetchFeed]);

  // ==================== POST ACTIONS ====================
  const handleReaction = async (postId: string, reactionType: ReactionType) => {
    if (!user) {
      setShowLoginPrompt(true);
      setActiveReactionPicker(null);
      return;
    }
    
    try {
      const result = await toggleReaction(postId, user.uid, reactionType);
      setPosts(prev => prev.map(p => 
        p.id === postId ? { 
          ...p, 
          reactions: result.reactions, 
          reactionCount: result.reactionCount 
        } : p
      ));
      setActiveReactionPicker(null);
    } catch (err) {
      console.error('Error reacting to post:', err);
    }
  };

  const handleDeletePost = async (postId: string) => {
    if (!user || !window.confirm('Delete this post? All comments will also be deleted.')) return;
    
    try {
      // Optimistically remove from UI first
      setPosts(prev => prev.filter(p => p.id !== postId));
      
      // Clear comments from local state
      setComments(prev => {
        const updated = { ...prev };
        delete updated[postId];
        return updated;
      });
      
      // Close expanded comments if this post was open
      if (expandedComments === postId) {
        setExpandedComments(null);
      }
      
      // Delete from Firebase (this also deletes comments)
      await deletePost(postId);
      console.log('[handleDeletePost] Post deleted successfully:', postId);
    } catch (err) {
      console.error('Error deleting post:', err);
      // Refresh to restore state if delete failed
      fetchFeed();
    }
  };

  const handleCreatePost = async () => {
    if (!newPostContent.trim() || !user || !userProfile) return;
    
    setSubmittingPost(true);
    
    try {
      const postId = await createPostWithImages({
        authorUid: user.uid,
        authorName: userProfile.name || user.email?.split('@')[0] || 'Anonymous',
        content: newPostContent,
        postType: newPostType as CommunityPost['postType'],
        authorDistrict: userProfile.district || 'Unknown',
        authorState: userProfile.state || 'Unknown',
        tags: []
      });
      
      // Add to local state immediately
      const newPost: CommunityPost = {
        id: postId,
        authorUid: user.uid,
        authorName: userProfile.name || user.email?.split('@')[0] || 'Anonymous',
        content: newPostContent,
        postType: newPostType as CommunityPost['postType'],
        authorDistrict: userProfile.district || 'Unknown',
        authorState: userProfile.state || 'Unknown',
        tags: [],
        imageUrls: [],
        likes: [],
        likeCount: 0,
        reactions: { like: [], love: [], celebrate: [], insightful: [], curious: [] },
        reactionCount: 0,
        commentCount: 0,
        createdAt: new Date(),
        updatedAt: new Date()
      };
      
      setPosts(prev => [newPost, ...prev]);
      setNewPostContent('');
      setShowNewPostForm(false);
    } catch (err) {
      console.error('Error creating post:', err);
      alert(`Failed to create post: ${err instanceof Error ? err.message : 'Please try again.'}`);
    } finally {
      setSubmittingPost(false);
    }
  };

  // ==================== COMMENT ACTIONS ====================
  const handleToggleComments = async (postId: string) => {
    console.log('[handleToggleComments] Toggling comments for post:', postId);
    
    if (expandedComments === postId) {
      setExpandedComments(null);
      setReplyingTo(null);
      return;
    }
    
    setExpandedComments(postId);
    setReplyingTo(null);
    
    // Always refresh comments when expanding
    try {
      console.log('[handleToggleComments] Fetching comments for post:', postId);
      const postComments = await getPostComments(postId);
      console.log('[handleToggleComments] Received comments:', postComments.length);
      setComments(prev => ({ ...prev, [postId]: postComments }));
    } catch (err) {
      console.error('[handleToggleComments] Error fetching comments:', err);
    }
  };

  const handleAddComment = useCallback(async (postId: string, overrideComment?: string) => {
    const commentText = overrideComment ?? newComment;
    console.log('[handleAddComment] Called with postId:', postId, 'commentText:', commentText, 'newComment state:', newComment);
    
    if (!user || !userProfile) {
      console.log('[handleAddComment] No user, showing login prompt');
      setShowLoginPrompt(true);
      return;
    }
    if (!commentText.trim()) {
      console.log('[handleAddComment] Empty comment, returning');
      return;
    }
    
    setSubmittingComment(true);
    const parentId = replyingTo?.commentId;
    
    // Clear input immediately for better UX
    setNewComment('');
    setReplyingTo(null);
    
    try {
      console.log('[handleAddComment] Adding comment:', {
        postId,
        authorUid: user.uid,
        content: commentText,
        parentCommentId: parentId
      });
      
      const newCommentId = await addComment(postId, {
        authorUid: user.uid,
        authorName: userProfile.name || user.email?.split('@')[0] || 'Anonymous',
        content: commentText,
        parentCommentId: parentId
      });
      
      console.log('[handleAddComment] Comment added with ID:', newCommentId);
      
      // Immediately add to local state for instant feedback
      const newCommentObj: PostComment = {
        id: newCommentId,
        postId,
        authorUid: user.uid,
        authorName: userProfile.name || user.email?.split('@')[0] || 'Anonymous',
        content: commentText,
        parentCommentId: parentId,
        reactions: { like: [], love: [], celebrate: [], insightful: [], curious: [] },
        reactionCount: 0,
        replyCount: 0,
        createdAt: new Date()
      };
      
      setComments(prev => ({
        ...prev,
        [postId]: [...(prev[postId] || []), newCommentObj]
      }));
      
      // Update post comment count
      setPosts(prev => prev.map(p => 
        p.id === postId ? { ...p, commentCount: p.commentCount + 1 } : p
      ));
      
    } catch (err) {
      console.error('[handleAddComment] Error adding comment:', err);
      // Restore comment if error
      setNewComment(commentText);
    } finally {
      setSubmittingComment(false);
    }
  }, [user, userProfile, newComment, replyingTo]);

  // ==================== TIME FORMATTING ====================
  const formatTimeAgo = (date: Date) => {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString('en-IN');
  };

  // ==================== RENDER ====================
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#f8fafc' }}>
        <div className="text-center">
          <Loader2 className="w-10 h-10 animate-spin mx-auto mb-3" style={{ color: colors.primary }} />
          <p className="text-sm text-gray-500">Loading Droplet Community...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-8" style={{ backgroundColor: '#f8fafc' }}>
      {/* Login Prompt Modal */}
      {showLoginPrompt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl p-6 max-w-sm mx-4 animate-in fade-in zoom-in duration-200">
            <div className="text-center">
              <div 
                className="w-16 h-16 rounded-full mx-auto mb-4 flex items-center justify-center"
                style={{ backgroundColor: colors.primary + '15' }}
              >
                <Droplets className="w-8 h-8" style={{ color: colors.primary }} />
              </div>
              <h3 className="text-lg font-bold text-gray-900 mb-2">Join the Community</h3>
              <p className="text-sm text-gray-500 mb-6">
                Sign in to react to posts, leave comments, and connect with other Droplets.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowLoginPrompt(false)}
                  className="flex-1 px-4 py-2.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors font-medium"
                >
                  Maybe Later
                </button>
                <button
                  onClick={() => {
                    setShowLoginPrompt(false);
                    // Navigate to auth or trigger auth modal
                    window.location.href = '/auth';
                  }}
                  className="flex-1 px-4 py-2.5 rounded-lg text-white font-medium transition-colors"
                  style={{ backgroundColor: colors.primary }}
                >
                  Sign In
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      
      {/* Tab Navigation - Clean header without extra stats */}
      <div className="sticky top-0 z-40 bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-4xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex gap-2">
              <button
                onClick={() => setActiveTab('feed')}
                className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                  activeTab === 'feed' ? 'text-white shadow-md' : 'text-gray-600 hover:bg-gray-100'
                }`}
                style={{ backgroundColor: activeTab === 'feed' ? colors.primary : 'transparent' }}
              >
                <MessageCircle className="w-4 h-4" />
                Feed
              </button>
              <button
                onClick={() => setActiveTab('nearby')}
                className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                  activeTab === 'nearby' ? 'text-white shadow-md' : 'text-gray-600 hover:bg-gray-100'
                }`}
                style={{ backgroundColor: activeTab === 'nearby' ? colors.primary : 'transparent' }}
              >
                <Users className="w-4 h-4" />
                Nearby Droplets
              </button>
            </div>
            
            <button 
              onClick={() => { fetchFeed(); }}
              className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
              title="Refresh"
            >
              <RefreshCw className="w-5 h-5 text-gray-500" />
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-6">
        {/* ==================== FEED TAB ==================== */}
        {activeTab === 'feed' && (
          <div className="space-y-4">
            {/* New Post Form */}
            {user && (
              <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                {!showNewPostForm ? (
                  <button 
                    onClick={() => setShowNewPostForm(true)}
                    className="w-full p-4 flex items-center gap-3 text-left hover:bg-gray-50 transition-colors"
                  >
                    <div 
                      className="w-10 h-10 rounded-full flex items-center justify-center text-white font-semibold"
                      style={{ backgroundColor: colors.primary }}
                    >
                      {userProfile?.name?.[0]?.toUpperCase() || '?'}
                    </div>
                    <span className="text-gray-500 flex-1">Share something with the community...</span>
                    <Plus className="w-5 h-5" style={{ color: colors.primary }} />
                  </button>
                ) : (
                  <div className="p-4 space-y-4">
                    <div className="flex items-start gap-3">
                      <div 
                        className="w-10 h-10 rounded-full flex items-center justify-center text-white font-semibold flex-shrink-0"
                        style={{ backgroundColor: colors.primary }}
                      >
                        {userProfile?.name?.[0]?.toUpperCase() || '?'}
                      </div>
                      <div className="flex-1">
                        <textarea
                          value={newPostContent}
                          onChange={(e) => setNewPostContent(e.target.value)}
                          placeholder="Share your experience, ask a question, or give a tip..."
                          className="w-full p-3 border border-gray-200 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900"
                          style={{ minHeight: '100px' }}
                          autoFocus
                        />
                      </div>
                    </div>
                    
                    {/* Post Type Selection */}
                    <div className="flex flex-wrap gap-2">
                      {Object.entries(POST_TYPE_CONFIG).map(([key, config]) => {
                        const IconComp = config.Icon;
                        return (
                          <button
                            key={key}
                            onClick={() => setNewPostType(key)}
                            className={`px-3 py-1.5 rounded-lg text-sm flex items-center gap-1.5 transition-all border ${
                              newPostType === key 
                                ? 'text-white border-transparent' 
                                : 'border-gray-200 hover:border-gray-300'
                            }`}
                            style={{ 
                              backgroundColor: newPostType === key ? config.color : 'white',
                              color: newPostType === key ? 'white' : config.color
                            }}
                          >
                            <IconComp className="w-3.5 h-3.5" />
                            {config.label}
                          </button>
                        );
                      })}
                    </div>

                    <div className="flex items-center justify-end pt-2 border-t border-gray-100">
                      <div className="flex gap-2">
                        <button
                          onClick={() => { 
                            setShowNewPostForm(false); 
                            setNewPostContent(''); 
                          }}
                          disabled={submittingPost}
                          className="px-4 py-2 rounded-lg text-gray-600 hover:bg-gray-100 transition-colors disabled:opacity-50"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={handleCreatePost}
                          disabled={!newPostContent.trim() || submittingPost}
                          className="px-5 py-2 rounded-lg text-white font-medium flex items-center gap-2 disabled:opacity-50 transition-colors"
                          style={{ backgroundColor: colors.primary }}
                        >
                          {submittingPost ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                          {submittingPost ? 'Posting...' : 'Post'}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Filter Tabs */}
            <div className="flex gap-2 overflow-x-auto pb-1">
              <button
                onClick={() => setPostFilter('all')}
                className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all border ${
                  postFilter === 'all' 
                    ? 'text-white border-transparent' 
                    : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                }`}
                style={{ backgroundColor: postFilter === 'all' ? colors.primary : undefined }}
              >
                All Posts
              </button>
              {Object.entries(POST_TYPE_CONFIG).map(([key, config]) => {
                const IconComp = config.Icon;
                return (
                  <button
                    key={key}
                    onClick={() => setPostFilter(key)}
                    className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all border flex items-center gap-1.5 ${
                      postFilter === key 
                        ? 'text-white border-transparent' 
                        : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                    }`}
                    style={{ backgroundColor: postFilter === key ? config.color : undefined }}
                  >
                    <IconComp className="w-3.5 h-3.5" />
                    {config.label}
                  </button>
                );
              })}
            </div>

            {/* Feed Posts */}
            <div className="space-y-4">
              {posts.length === 0 ? (
                <div className="bg-white rounded-xl p-12 text-center border border-gray-100">
                  <MessageCircle className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                  <p className="text-gray-500">No posts found. Be the first to share!</p>
                </div>
              ) : (
                posts.map(post => {
                  const typeConfig = POST_TYPE_CONFIG[post.postType] || POST_TYPE_CONFIG.general;
                  const TypeIcon = typeConfig.Icon;
                  const isOwner = post.authorUid === user?.uid;
                  
                  // Find user's current reaction
                  const userReaction = Object.entries(post.reactions || {}).find(
                    ([, users]) => users?.includes(user?.uid || '')
                  )?.[0] as ReactionType | undefined;
                  
                  // Get top 3 reactions with counts
                  const topReactions = Object.entries(post.reactions || {})
                    .filter(([, users]) => users?.length > 0)
                    .sort((a, b) => (b[1]?.length || 0) - (a[1]?.length || 0))
                    .slice(0, 3);
                  
                  return (
                    <div key={post.id} className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                      {/* Post Header */}
                      <div className="p-4 flex items-start gap-3">
                        <div 
                          className="w-11 h-11 rounded-full flex items-center justify-center text-white font-semibold flex-shrink-0"
                          style={{ backgroundColor: colors.primary }}
                        >
                          {post.authorName[0]?.toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-gray-900">{post.authorName}</span>
                            <span 
                              className="px-2 py-0.5 rounded text-xs font-medium flex items-center gap-1"
                              style={{ backgroundColor: typeConfig.color + '15', color: typeConfig.color }}
                            >
                              <TypeIcon className="w-3 h-3" />
                              {typeConfig.label}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 text-xs text-gray-500 mt-0.5">
                            <MapPin className="w-3 h-3" />
                            <span>{post.authorDistrict}, {post.authorState}</span>
                            <span>·</span>
                            <span>{formatTimeAgo(post.createdAt)}</span>
                          </div>
                        </div>
                        {isOwner && (
                          <button 
                            onClick={() => handleDeletePost(post.id!)}
                            className="p-1.5 hover:bg-red-50 rounded-lg transition-colors text-gray-400 hover:text-red-500"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>

                      {/* Post Content */}
                      <div className="px-4 pb-3">
                        <p className="text-gray-800 leading-relaxed whitespace-pre-wrap">{post.content}</p>
                        
                        {/* Post Images */}
                        {post.imageUrls && post.imageUrls.length > 0 && (
                          <div className={`mt-3 grid gap-2 ${
                            post.imageUrls.length === 1 ? 'grid-cols-1' : 
                            post.imageUrls.length === 2 ? 'grid-cols-2' : 
                            post.imageUrls.length === 3 ? 'grid-cols-2' : 'grid-cols-2'
                          }`}>
                            {post.imageUrls.map((url, idx) => (
                              <img 
                                key={idx}
                                src={url}
                                alt={`Post image ${idx + 1}`}
                                className={`w-full rounded-lg object-cover border border-gray-200 cursor-pointer hover:opacity-90 transition-opacity ${
                                  post.imageUrls!.length === 1 ? 'max-h-96' : 
                                  post.imageUrls!.length === 3 && idx === 0 ? 'row-span-2 h-full' : 'h-40'
                                }`}
                                onClick={() => window.open(url, '_blank')}
                              />
                            ))}
                          </div>
                        )}
                        
                        {post.tags && post.tags.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 mt-3">
                            {post.tags.map(tag => (
                              <span 
                                key={tag}
                                className="px-2 py-0.5 rounded text-xs bg-gray-100 text-gray-600"
                              >
                                #{tag}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Reaction Summary */}
                      {(post.reactionCount || 0) > 0 && (
                        <div className="px-4 pb-2 flex items-center gap-2">
                          <div className="flex -space-x-1">
                            {topReactions.map(([type]) => (
                              <span key={type} className="text-sm bg-white rounded-full border border-gray-100 p-0.5">
                                {REACTION_CONFIG[type as ReactionType]?.emoji}
                              </span>
                            ))}
                          </div>
                          <span className="text-sm text-gray-500">{post.reactionCount}</span>
                        </div>
                      )}

                      {/* Post Actions */}
                      <div className="px-4 py-3 border-t border-gray-100 flex items-center gap-1">
                        <div className="relative">
                          <button 
                            onClick={() => userReaction 
                              ? handleReaction(post.id!, userReaction) // Toggle off
                              : setActiveReactionPicker(activeReactionPicker === post.id ? null : post.id!)
                            }
                            onMouseEnter={() => setActiveReactionPicker(post.id!)}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-colors ${
                              userReaction 
                                ? 'bg-blue-50' 
                                : 'hover:bg-gray-100 text-gray-600'
                            }`}
                            style={{ color: userReaction ? REACTION_CONFIG[userReaction].color : undefined }}
                          >
                            <span className="text-lg">
                              {userReaction ? REACTION_CONFIG[userReaction].emoji : '👍'}
                            </span>
                            <span className="text-sm font-medium">
                              {userReaction ? REACTION_CONFIG[userReaction].label : 'React'}
                            </span>
                          </button>
                          <ReactionPicker 
                            isOpen={activeReactionPicker === post.id}
                            onClose={() => setActiveReactionPicker(null)}
                            onSelect={(type) => handleReaction(post.id!, type)}
                            currentReaction={userReaction}
                          />
                        </div>
                        <button 
                          onClick={() => handleToggleComments(post.id!)}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg hover:bg-gray-100 transition-colors text-gray-600"
                        >
                          <MessageCircle className="w-4 h-4" />
                          <span className="text-sm">{post.commentCount || 0}</span>
                          <ChevronDown className={`w-3 h-3 transition-transform ${expandedComments === post.id ? 'rotate-180' : ''}`} />
                        </button>
                      </div>

                      {/* Comments Section */}
                      {expandedComments === post.id && (
                        <div className="px-4 pb-4 border-t border-gray-100 bg-gradient-to-b from-gray-50 to-white">
                          <div className="pt-4 space-y-4">
                            {/* Existing Comments */}
                            {(() => {
                              const allPostComments = comments[post.id!] || [];
                              const topLevelComments = allPostComments.filter(c => !c.parentCommentId);
                              
                              if (allPostComments.length === 0) {
                                return <p className="text-sm text-gray-400 text-center py-2">No comments yet. Be the first!</p>;
                              }
                              
                              // If no top-level but have comments, show all (orphaned)
                              const commentsToShow = topLevelComments.length > 0 ? topLevelComments : allPostComments;
                              
                              return commentsToShow.map(comment => (
                                <CommentItem
                                  key={comment.id}
                                  comment={comment}
                                  userId={user?.uid}
                                  userProfile={userProfile}
                                  colors={colors}
                                  postId={post.id!}
                                  onLoginRequired={() => setShowLoginPrompt(true)}
                                  allComments={allPostComments}
                                  onRefresh={async () => {
                                    // Refresh comments and update count
                                    const postComments = await getPostComments(post.id!);
                                    setComments(prev => ({ ...prev, [post.id!]: postComments }));
                                    setPosts(prev => prev.map(p => 
                                      p.id === post.id ? { ...p, commentCount: p.commentCount + 1 } : p
                                    ));
                                  }}
                                />
                              ));
                            })()}
                            
                            {/* Add New Top-Level Comment */}
                            {user && (
                              <div className="pt-3 border-t border-gray-100">
                                {/* Cancel reply mode indicator */}
                                {replyingTo && (
                                  <div className="flex items-center gap-2 mb-2 px-2 py-1.5 bg-blue-50 rounded-lg">
                                    <span className="text-xs text-blue-600">
                                      Replying to <strong>@{replyingTo.authorName}</strong>
                                    </span>
                                    <button
                                      onClick={() => {
                                        setReplyingTo(null);
                                        setNewComment('');
                                      }}
                                      className="ml-auto text-blue-400 hover:text-blue-600"
                                    >
                                      <X className="w-4 h-4" />
                                    </button>
                                  </div>
                                )}
                                <div className="flex gap-3">
                                  <div 
                                    className="w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0"
                                    style={{ backgroundColor: colors.primary }}
                                  >
                                    {userProfile?.name?.[0]?.toUpperCase() || '?'}
                                  </div>
                                  <div className="flex-1">
                                    <div className="flex gap-2">
                                      <input
                                        type="text"
                                        value={newComment}
                                        onChange={(e) => {
                                          console.log('[Main Comment Input] onChange:', e.target.value);
                                          setNewComment(e.target.value);
                                        }}
                                        placeholder={replyingTo ? `Reply to @${replyingTo.authorName}...` : "Add a comment..."}
                                        className="flex-1 px-4 py-2.5 rounded-full border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent bg-white"
                                        onKeyDown={(e) => {
                                          if (e.key === 'Enter' && !e.shiftKey) {
                                            e.preventDefault();
                                            const inputValue = (e.target as HTMLInputElement).value;
                                            console.log('[Main Comment Input] Enter pressed, value:', inputValue);
                                            handleAddComment(post.id!, inputValue);
                                          }
                                        }}
                                      />
                                      <button
                                        type="button"
                                        onClick={() => {
                                          console.log('[Main Comment Button] Clicked! newComment:', newComment, 'postId:', post.id);
                                          handleAddComment(post.id!, newComment);
                                        }}
                                        disabled={!newComment.trim() || submittingComment}
                                        className="w-10 h-10 rounded-full flex items-center justify-center text-white disabled:opacity-50 transition-all hover:scale-105"
                                        style={{ backgroundColor: colors.primary }}
                                      >
                                        {submittingComment ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                                      </button>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            )}
                            
                            {/* Login prompt for logged-out users */}
                            {!user && (
                              <div className="pt-3 border-t border-gray-100">
                                <button
                                  onClick={() => setShowLoginPrompt(true)}
                                  className="w-full py-3 rounded-lg border border-dashed border-gray-300 text-gray-500 hover:border-gray-400 hover:text-gray-600 transition-colors flex items-center justify-center gap-2"
                                >
                                  <MessageCircle className="w-4 h-4" />
                                  <span className="text-sm">Sign in to join the conversation</span>
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* ==================== NEARBY DROPLETS TAB ==================== */}
        {activeTab === 'nearby' && (
          <div className="space-y-4">
            {/* Location Banner */}
            <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                    <MapPin className="w-5 h-5" style={{ color: colors.primary }} />
                    {userLocation ? 'Location Enabled' : 'Enable Location'}
                  </h3>
                  <p className="text-sm text-gray-500 mt-1">
                    {userLocation 
                      ? 'Showing droplets sorted by distance from you'
                      : 'Share your location to find nearby community members'
                    }
                  </p>
                </div>
                {!userLocation && (
                  <button
                    onClick={requestLocation}
                    disabled={locationLoading}
                    className="px-4 py-2 rounded-lg text-white font-medium flex items-center gap-2"
                    style={{ backgroundColor: colors.primary }}
                  >
                    {locationLoading ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Navigation className="w-4 h-4" />
                    )}
                    {locationLoading ? 'Getting...' : 'Use My Location'}
                  </button>
                )}
              </div>
            </div>

            {/* No Nearby Found Message */}
            {nearbyResult?.noNearbyFound && nearbyResult?.totalCount > 0 && (
              <div className="bg-gradient-to-r from-amber-50 to-orange-50 rounded-xl p-4 border border-amber-200">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 bg-amber-100 rounded-full flex items-center justify-center flex-shrink-0">
                    <MapPin className="w-5 h-5 text-amber-600" />
                  </div>
                  <div>
                    <h4 className="font-semibold text-amber-800">
                      No Droplets Found Near {nearbyResult.userLocation || 'Your Location'}
                    </h4>
                    <p className="text-sm text-amber-700 mt-1">
                      Don't worry! Here are other droplets from across the community you can connect with.
                      Showing {nearbyResult.totalCount} droplets sorted by distance.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Nearby Stats */}
            {nearbyResult && (
              <div className="flex items-center justify-between text-sm text-gray-500 px-1">
                <span>
                  {nearbyResult.nearbyCount > 0 
                    ? `${nearbyResult.nearbyCount} droplets within 50km · ${nearbyResult.totalCount} total`
                    : `${nearbyResult.totalCount} droplets in community`
                  }
                </span>
                <span>{nearbyResult.droplets.length} shown</span>
              </div>
            )}

            {/* Nearby Droplets List */}
            {!nearbyResult || nearbyResult.totalCount === 0 ? (
              <div className="bg-white rounded-xl p-12 text-center border border-gray-100">
                <Users className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                <p className="text-gray-500">No droplets in the community yet</p>
                <p className="text-sm text-gray-400 mt-1">Be the first to join!</p>
              </div>
            ) : (
              <div className="space-y-3">
                {nearbyResult.droplets.map((droplet, index) => (
                  <div key={droplet.uid} className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
                    <div className="flex items-center gap-4">
                      <div className="relative">
                        <div 
                          className="w-14 h-14 rounded-full flex items-center justify-center text-white text-lg font-semibold"
                          style={{ backgroundColor: SECONDARY_COLOR }}
                        >
                          {droplet.name[0]?.toUpperCase()}
                        </div>
                        {/* Rank badge for top 3 */}
                        {index < 3 && droplet.distance !== undefined && (
                          <div className="absolute -top-1 -right-1 w-6 h-6 bg-blue-500 text-white rounded-full flex items-center justify-center text-xs font-bold">
                            {index + 1}
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h4 className="font-semibold text-gray-900">{droplet.name}</h4>
                        <p className="text-sm text-gray-500 flex items-center gap-1 flex-wrap">
                          <MapPin className="w-3 h-3" />
                          {droplet.district}, {droplet.state}
                        </p>
                        <div className="flex items-center gap-2 mt-1">
                          {droplet.distance !== undefined && (
                            <span className="px-2 py-0.5 bg-blue-50 text-blue-600 rounded text-xs font-medium">
                              📍 {droplet.distance < 1 ? `${(droplet.distance * 1000).toFixed(0)}m` : `${droplet.distance}km`} away
                            </span>
                          )}
                          {droplet.district?.toLowerCase() === userProfile?.district?.toLowerCase() && (
                            <span className="px-2 py-0.5 bg-green-50 text-green-600 rounded text-xs font-medium">
                              Same District
                            </span>
                          )}
                        </div>
                        <div className="flex gap-4 mt-2 text-xs text-gray-500">
                          <span className="flex items-center gap-1">
                            <Users className="w-3 h-3" />
                            {droplet.n_members} members
                          </span>
                          <span className="flex items-center gap-1">
                            <Droplets className="w-3 h-3" />
                            {droplet.catchment_area} sqm
                          </span>
                          {droplet.farmland_area > 0 && (
                            <span>{(droplet.farmland_area / 4047).toFixed(1)} acres</span>
                          )}
                        </div>
                      </div>
                      <button 
                        onClick={() => {
                          if (droplet.email) {
                            const subject = encodeURIComponent(`Let's connect on INDRA - Water Conservation`);
                            const body = encodeURIComponent(`Hi ${droplet.name},\n\nI found your profile on INDRA (Initiative for Drainage and Rainwater Acquisition) and would love to connect with you about water conservation efforts in our area.\n\nLooking forward to hearing from you!\n\nBest regards,\n${userProfile?.name || 'A fellow Droplet'}`);
                            window.open(`https://mail.google.com/mail/?view=cm&fs=1&to=${droplet.email}&su=${subject}&body=${body}`, '_blank');
                          } else {
                            alert('Email not available for this user');
                          }
                        }}
                        className="px-4 py-2 rounded-lg text-white font-medium text-sm hover:opacity-90 transition-opacity"
                        style={{ backgroundColor: colors.primary }}
                      >
                        Connect
                      </button>
                    </div>
                  </div>
                ))}
                
                {/* Load More Button */}
                {nearbyResult?.hasMore && (
                  <div className="text-center pt-4">
                    <button
                      onClick={loadMoreNearby}
                      disabled={loadingMoreNearby}
                      className="px-6 py-3 rounded-lg border-2 border-gray-200 text-gray-600 font-medium hover:border-gray-300 hover:bg-gray-50 transition-colors disabled:opacity-50 flex items-center gap-2 mx-auto"
                    >
                      {loadingMoreNearby ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Loading...
                        </>
                      ) : (
                        <>
                          <ChevronDown className="w-4 h-4" />
                          Load More Droplets
                        </>
                      )}
                    </button>
                    <p className="text-xs text-gray-400 mt-2">
                      Showing {nearbyResult.droplets.length} of {nearbyResult.totalCount}
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
