import { useState, useEffect, useCallback } from 'react';
import { useTheme } from '../../contexts/ThemeContext';
import {
  ArrowRight, BookOpen, Newspaper, Award,
  Users, Calendar, ChevronRight, ExternalLink, RefreshCw
} from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { HotspotTable } from '../../components/climate/HotspotTable';

// Content types
interface ContentItem {
  id: string;
  type: 'scheme' | 'news' | 'blog' | 'story';
  title: string;
  excerpt: string;
  date: string;
  source: string;
  url: string;
}

// Content Card
function ContentCard({ item }: { item: ContentItem }) {
  const typeConfig = {
    scheme: { bg: 'from-emerald-500 to-emerald-600', icon: Award, label: 'Govt Scheme' },
    news: { bg: 'from-cyan-500 to-blue-600', icon: Newspaper, label: 'News' },
    blog: { bg: 'from-violet-500 to-purple-600', icon: BookOpen, label: 'Blog' },
    story: { bg: 'from-amber-500 to-orange-600', icon: Users, label: 'Success Story' },
  };

  const config = typeConfig[item.type];
  const Icon = config.icon;

  return (
    <a
      href={item.url}
      target="_blank"
      rel="noopener noreferrer"
      className="group bg-white rounded-2xl overflow-hidden shadow-sm hover:shadow-xl transition-all duration-300 hover:-translate-y-1 block"
    >
      <div className={`h-20 bg-gradient-to-br ${config.bg} relative overflow-hidden`}>
        <Icon className="absolute bottom-2 right-3 w-10 h-10 text-white/20" />
        <div className="absolute top-3 left-3">
          <span className="px-2 py-0.5 bg-white/20 backdrop-blur-sm rounded-full text-xs font-medium text-white">
            {config.label}
          </span>
        </div>
        <ExternalLink className="absolute top-3 right-3 w-3.5 h-3.5 text-white/50 opacity-0 group-hover:opacity-100 transition-opacity" />
      </div>
      <div className="p-4">
        <p className="text-xs text-gray-500 flex items-center gap-1 mb-1">
          <Calendar className="w-3 h-3" /> {item.date}
        </p>
        <h3 className="font-semibold text-gray-800 text-sm mb-1 line-clamp-2 group-hover:text-cyan-600 transition-colors">
          {item.title}
        </h3>
        <p className="text-xs text-gray-500 line-clamp-2">{item.excerpt}</p>
        <p className="text-xs text-gray-400 mt-2">Source: {item.source}</p>
      </div>
    </a>
  );
}

// Loading skeleton
function ContentSkeleton() {
  return (
    <div className="bg-white rounded-2xl overflow-hidden shadow-sm animate-pulse">
      <div className="h-20 bg-gray-200" />
      <div className="p-4 space-y-2">
        <div className="h-3 w-16 bg-gray-200 rounded" />
        <div className="h-4 w-full bg-gray-200 rounded" />
        <div className="h-3 w-3/4 bg-gray-200 rounded" />
      </div>
    </div>
  );
}

export function LandingPage() {
  const { colors } = useTheme();
  const navigate = useNavigate();
  const [content, setContent] = useState<ContentItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState<string>('All');

  // Fetch content
  const fetchDynamicContent = useCallback(async () => {
    setIsLoading(true);

    try {
      const realContent: ContentItem[] = [
        {
          id: '1',
          type: 'scheme',
          title: 'Jal Shakti Abhiyan - Catch The Rain Campaign',
          excerpt: 'Ministry of Jal Shakti initiative promoting rainwater harvesting across India.',
          date: 'Dec 2024',
          source: 'Ministry of Jal Shakti',
          url: 'https://jalshakti-ddws.gov.in/',
        },
        {
          id: '2',
          type: 'scheme',
          title: 'Atal Bhujal Yojana - Groundwater Management',
          excerpt: 'Central Government scheme for sustainable groundwater management.',
          date: 'Dec 2024',
          source: 'Govt of India',
          url: 'https://ataljal.mowr.gov.in/',
        },
        {
          id: '3',
          type: 'news',
          title: 'CGWB Guidelines on Rainwater Harvesting',
          excerpt: 'Central Ground Water Board technical guidelines for RWH systems.',
          date: 'Dec 2024',
          source: 'CGWB',
          url: 'http://cgwb.gov.in/rwh.html',
        },
        {
          id: '4',
          type: 'blog',
          title: 'Rainwater Harvesting: A Complete Guide',
          excerpt: 'Comprehensive guide on methods, benefits, and implementation.',
          date: 'Dec 2024',
          source: 'India Water Portal',
          url: 'https://www.indiawaterportal.org/topics/rainwater-harvesting',
        },
        {
          id: '5',
          type: 'story',
          title: 'CSE Rainwater Harvesting Resource Centre',
          excerpt: 'Successful RWH implementations showcased across India.',
          date: 'Dec 2024',
          source: 'CSE India',
          url: 'https://www.cseindia.org/rainwater-harvesting-702',
        },
        {
          id: '6',
          type: 'news',
          title: 'CPWD Guidelines for Rainwater Harvesting',
          excerpt: 'RWH guidelines for government buildings and infrastructure.',
          date: 'Dec 2024',
          source: 'CPWD',
          url: 'https://cpwd.gov.in/Publication/rwh.pdf',
        },
      ];

      let filteredContent = realContent;
      if (activeFilter !== 'All') {
        const typeMap: Record<string, string> = {
          'Govt Schemes': 'scheme',
          'News': 'news',
          'Blogs': 'blog',
          'Success Stories': 'story',
        };
        filteredContent = realContent.filter(item => item.type === typeMap[activeFilter]);
      }

      setContent(filteredContent);
    } catch (error) {
      console.error('Error fetching content:', error);
    } finally {
      setIsLoading(false);
    }
  }, [activeFilter]);

  useEffect(() => {
    fetchDynamicContent();
  }, [fetchDynamicContent]);

  const filters = ['All', 'Govt Schemes', 'News', 'Blogs', 'Success Stories'];

  return (
    <div className="min-h-screen" style={{ backgroundColor: colors.background }}>

      {/* Hero Section with GIF Background */}
      <section className="relative min-h-[90vh] overflow-hidden flex items-center">
        {/* Rain GIF Background */}
        <div
          className="absolute inset-0 bg-cover bg-center bg-no-repeat"
          style={{
            backgroundImage: 'url(https://i.pinimg.com/originals/e1/b4/a6/e1b4a60876593bc5c849b2a8e9029bec.gif)',
            backgroundSize: 'cover',
          }}
        />

        {/* Subtle dark gradient for text readability - no blue overlay */}
        <div className="absolute inset-0 bg-gradient-to-r from-black/60 via-black/40 to-transparent" />

        {/* Content */}
        <div className="relative z-10 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="grid lg:grid-cols-2 gap-8 lg:gap-12 items-center">

            {/* Left Side - INDRA Description */}
            <div className="text-white">
              <div className="flex items-center gap-3 mb-4">

                <div>
                  <h2 className="text-2xl font-bold">INDRA</h2>
                  <p className="text-white/70 text-xs">Initiative for National Drainage and Rainwater Acquisition</p>
                </div>
              </div>

              <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold leading-tight mb-4">
                India's Water
                <span className="block text-cyan-200">Conservation Hub</span>
              </h1>

              <p className="text-base sm:text-lg text-white/80 mb-6 leading-relaxed max-w-lg">
                Too much water, too little of it, and the heat in between. INDRA reads the monsoon that floods your
                street and the summer that dries your tap, then sizes the rooftop system that survives both.
              </p>

              <div className="flex flex-wrap gap-3">
                <Link
                  to="/assessment"
                  className="inline-flex items-center gap-2 px-6 py-3 bg-white text-sm font-bold rounded-full hover:shadow-lg transition-all hover:-translate-y-0.5"
                  style={{ color: colors.primary }}
                >
                  Start Free Assessment
                  <ArrowRight className="w-4 h-4" />
                </Link>
                <Link
                  to="/climate"
                  className="inline-flex items-center gap-2 px-5 py-3 border border-white/40 bg-white/10 text-white text-sm font-semibold rounded-full hover:bg-white/20 transition-all"
                >
                  See your climate risk <ChevronRight className="w-4 h-4" />
                </Link>
                <a
                  href="#learn"
                  className="inline-flex items-center gap-2 px-5 py-3 text-white/80 text-sm font-medium rounded-full hover:text-white transition-all"
                >
                  Explore Resources
                </a>
              </div>
            </div>

            {/* Right Side - Single Compact Features Box with Blue Overlay */}
            <div
              className="backdrop-blur-md rounded-2xl border border-white/20 p-5 lg:p-6"
              style={{ backgroundColor: 'rgba(6, 118, 200, 0.9)' }}
            >
              <h3 className="text-lg font-bold text-white mb-4">INDRA Capabilities</h3>

              <div className="space-y-3 text-sm text-white/90">
                <div className="flex items-start gap-3">
                  <div className="w-1.5 h-1.5 rounded-full bg-cyan-300 mt-2 flex-shrink-0" />
                  <div>
                    <span className="font-semibold">Flood, scarcity and heat risk</span>
                    <span className="text-white/70"> - Live 7-day forecast plus district climatology, with alerts and tank monitoring</span>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="w-1.5 h-1.5 rounded-full bg-cyan-300 mt-2 flex-shrink-0" />
                  <div>
                    <span className="font-semibold">Smart Crop Suggestion</span>
                    <span className="text-white/70"> - Based on mandi prices, water consumption, and environmental impact via GIS</span>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="w-1.5 h-1.5 rounded-full bg-cyan-300 mt-2 flex-shrink-0" />
                  <div>
                    <span className="font-semibold">Water Management System</span>
                    <span className="text-white/70"> - Plan usage based on season, GIS, dwellers, cattle, and crop type</span>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="w-1.5 h-1.5 rounded-full bg-cyan-300 mt-2 flex-shrink-0" />
                  <div>
                    <span className="font-semibold">Vendor Connect</span>
                    <span className="text-white/70"> - Online and offline resources for products and maintenance</span>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="w-1.5 h-1.5 rounded-full bg-cyan-300 mt-2 flex-shrink-0" />
                  <div>
                    <span className="font-semibold">3D Visualizer</span>
                    <span className="text-white/70"> - Intuitive DIY guide for every corner of India</span>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="w-1.5 h-1.5 rounded-full bg-cyan-300 mt-2 flex-shrink-0" />
                  <div>
                    <span className="font-semibold">Complete Assessment</span>
                    <span className="text-white/70"> - Cost, feasibility, and implementation timeline based on user profile</span>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="w-1.5 h-1.5 rounded-full bg-cyan-300 mt-2 flex-shrink-0" />
                  <div>
                    <span className="font-semibold">Droplet Community</span>
                    <span className="text-white/70"> - Real-time network to enhance conservation and avoid water-mafia traps</span>
                  </div>
                </div>
              </div>

              <div className="mt-5 pt-4 border-t border-white/10 text-center">
                <p className="text-xs text-white/60">
                  <s>Build</s> Built for Rural India
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Where the swing is worst */}
      <section className="px-4 sm:px-6 lg:px-8 py-10" style={{ backgroundColor: colors.background }}>
        <div className="max-w-5xl mx-auto">
          <HotspotTable
            onSelect={(district, state) => {
              try {
                window.localStorage.setItem('indra.climate.place', JSON.stringify({ district, state }));
              } catch {
                // storage blocked: the climate page opens on its default place
              }
              navigate('/climate');
            }}
          />
        </div>
      </section>

      {/* Architecture Pipeline Diagram - Horizontal */}
      <section className="py-12 px-4 sm:px-6 lg:px-8 overflow-x-auto" style={{ backgroundColor: '#f8fafc' }}>
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-8">
            <h2 className="text-2xl font-bold mb-1" style={{ color: colors.text }}>
              INDRA Architecture
            </h2>
            <p className="text-xs" style={{ color: colors.textSecondary }}>
              Novel AI-powered pipeline for comprehensive water management
            </p>
          </div>

          {/* Horizontal Pipeline */}
          <div className="flex items-center justify-between gap-2 min-w-[900px] pb-4">

            {/* Stage 1: Inputs */}
            <div className="flex-shrink-0 w-36">
              <div className="bg-white rounded-lg p-3 shadow-sm border-l-4 mb-2" style={{ borderColor: '#0676c8' }}>
                <p className="font-bold text-xs mb-1" style={{ color: colors.primary }}>Knowledge</p>
                <div className="flex flex-wrap gap-1">
                  <span className="px-1.5 py-0.5 bg-blue-50 text-blue-700 rounded text-[10px]">GIS</span>
                  <span className="px-1.5 py-0.5 bg-blue-50 text-blue-700 rounded text-[10px]">RAG</span>
                  <span className="px-1.5 py-0.5 bg-blue-50 text-blue-700 rounded text-[10px]">KB</span>
                </div>
              </div>
              <div className="bg-white rounded-lg p-3 shadow-sm border-l-4" style={{ borderColor: '#32a854' }}>
                <p className="font-bold text-xs mb-1" style={{ color: '#32a854' }}>User Profile</p>
                <div className="flex flex-wrap gap-1">
                  <span className="px-1.5 py-0.5 bg-green-50 text-green-700 rounded text-[10px]">Location</span>
                  <span className="px-1.5 py-0.5 bg-green-50 text-green-700 rounded text-[10px]">Land</span>
                </div>
              </div>
            </div>

            {/* Arrow */}
            <div className="flex-shrink-0 flex items-center">
              <div className="w-8 h-0.5 bg-gray-300"></div>
              <div className="w-2 h-2 border-r-2 border-t-2 border-gray-400 transform rotate-45 -ml-1"></div>
            </div>

            {/* Stage 2: AI Core */}
            <div className="flex-shrink-0 bg-gradient-to-r from-purple-600 to-indigo-600 rounded-xl p-3 text-white shadow-lg w-44">
              <p className="font-bold text-xs text-center mb-2">AI Core - LLM</p>
              <div className="space-y-1">
                <div className="bg-white/20 rounded px-2 py-1 text-center">
                  <p className="text-[10px] opacity-70">Primary</p>
                  <p className="font-semibold text-xs">Any OpenAI-compatible model</p>
                </div>
                <div className="bg-white/20 rounded px-2 py-1 text-center">
                  <p className="text-[10px] opacity-70">Agent</p>
                  <p className="font-semibold text-xs">Strands + tools</p>
                </div>
              </div>
            </div>

            {/* Arrow */}
            <div className="flex-shrink-0 flex items-center">
              <div className="w-8 h-0.5 bg-gray-300"></div>
              <div className="w-2 h-2 border-r-2 border-t-2 border-gray-400 transform rotate-45 -ml-1"></div>
            </div>

            {/* Stage 3: Core Features */}
            <div className="flex-shrink-0 grid grid-cols-2 gap-1.5 w-40">
              <div className="bg-white rounded-lg p-2 shadow-sm text-center border-t-2" style={{ borderColor: '#0676c8' }}>
                <p className="font-semibold text-[10px]" style={{ color: colors.text }}>Chatbot</p>
              </div>
              <div className="bg-white rounded-lg p-2 shadow-sm text-center border-t-2" style={{ borderColor: '#0676c8' }}>
                <p className="font-semibold text-[10px]" style={{ color: colors.text }}>Assessment</p>
              </div>
              <div className="bg-white rounded-lg p-2 shadow-sm text-center border-t-2" style={{ borderColor: '#32a854' }}>
                <p className="font-semibold text-[10px]" style={{ color: colors.text }}>Water Mgmt</p>
              </div>
              <div className="bg-white rounded-lg p-2 shadow-sm text-center border-t-2" style={{ borderColor: '#32a854' }}>
                <p className="font-semibold text-[10px]" style={{ color: colors.text }}>Crop Advisor</p>
              </div>
            </div>

            {/* Arrow */}
            <div className="flex-shrink-0 flex items-center">
              <div className="w-8 h-0.5 bg-gray-300"></div>
              <div className="w-2 h-2 border-r-2 border-t-2 border-gray-400 transform rotate-45 -ml-1"></div>
            </div>

            {/* Stage 4: User Enhancements */}
            <div className="flex-shrink-0 space-y-1.5 w-36">
              <div className="bg-gradient-to-r from-orange-500 to-amber-500 rounded-lg p-2 text-white text-center shadow-sm">
                <p className="font-bold text-xs">3D Visualizer</p>
                <p className="text-[9px] opacity-80">Blender + D5</p>
              </div>
              <div className="bg-gradient-to-r from-cyan-500 to-blue-500 rounded-lg p-2 text-white text-center shadow-sm">
                <p className="font-bold text-xs">Droplet</p>
                <p className="text-[9px] opacity-80">Firebase RT</p>
              </div>
              <div className="bg-gradient-to-r from-emerald-500 to-teal-500 rounded-lg p-2 text-white text-center shadow-sm">
                <p className="font-bold text-xs">Vendor</p>
                <p className="text-[9px] opacity-80">Web Scraping</p>
              </div>
            </div>
          </div>

          {/* Tech Stack */}
          <div className="flex flex-wrap justify-center gap-2 mt-4 pt-4 border-t border-gray-200">
            <span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full text-[10px]">React + TypeScript</span>
            <span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full text-[10px]">FastAPI</span>
            <span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full text-[10px]">Firebase</span>
            <span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full text-[10px]">Strands Agents</span>
            <span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full text-[10px]">OpenSearch</span>
            <span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full text-[10px]">Cedar</span>
            <span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full text-[10px]">AWS SAM + LocalStack</span>
            <span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full text-[10px]">Corretto</span>
            <span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full text-[10px]">Finch</span>
            <span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full text-[10px]">EKS Distro / Anywhere</span>
            <span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full text-[10px]">Firecracker</span>
            <span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full text-[10px]">Blender</span>
          </div>
        </div>
      </section>

      {/* Learning Hub Section */}
      <section id="learn" className="py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-8">
            <h2 className="text-2xl sm:text-3xl font-bold mb-2" style={{ color: colors.text }}>
              Learning Hub and Resource Centre
            </h2>
            <p className="text-sm" style={{ color: colors.textSecondary }}>
              Government schemes, latest news, educational content, and success stories
            </p>
          </div>

          {/* Filters */}
          <div className="flex flex-wrap justify-center gap-2 mb-8">
            {filters.map((filter) => (
              <button
                key={filter}
                onClick={() => setActiveFilter(filter)}
                className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all ${activeFilter === filter
                  ? 'text-white shadow-md'
                  : 'bg-gray-100 hover:bg-gray-200'
                  }`}
                style={activeFilter === filter ? { backgroundColor: colors.primary } : { color: colors.textSecondary }}
              >
                {filter}
              </button>
            ))}
            <button
              onClick={() => fetchDynamicContent()}
              className="p-1.5 rounded-full bg-gray-100 hover:bg-gray-200 transition-all"
              title="Refresh content"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} style={{ color: colors.textSecondary }} />
            </button>
          </div>

          {/* Content Grid */}
          {isLoading ? (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {[...Array(6)].map((_, i) => <ContentSkeleton key={i} />)}
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {content.map((item) => (
                <ContentCard key={item.id} item={item} />
              ))}
            </div>
          )}

          {!isLoading && content.length === 0 && (
            <div className="text-center py-8">
              <p style={{ color: colors.textSecondary }}>No content available for this filter.</p>
            </div>
          )}
        </div>
      </section>

      {/* Why RWH Section */}
      <section className="py-12 px-4 sm:px-6 lg:px-8 bg-gray-50">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-2xl font-bold text-center mb-8" style={{ color: colors.text }}>
            Why Rainwater Harvesting Matters
          </h2>

          <div className="bg-white rounded-2xl p-6 shadow-sm">
            <div className="grid sm:grid-cols-3 gap-6 text-center">
              <div>
                <h3 className="text-lg font-bold mb-1" style={{ color: colors.primary }}>Water Security</h3>
                <p className="text-sm" style={{ color: colors.textSecondary }}>
                  India receives 1,170mm average annual rainfall. A 100 sqm roof can harvest up to 88,000 liters yearly.
                </p>
              </div>
              <div>
                <h3 className="text-lg font-bold mb-1" style={{ color: colors.primary }}>Government Support</h3>
                <p className="text-sm" style={{ color: colors.textSecondary }}>
                  Multiple schemes offer subsidies for RWH systems. Many cities mandate RWH for new constructions.
                </p>
              </div>
              <div>
                <h3 className="text-lg font-bold mb-1" style={{ color: colors.primary }}>Groundwater Recharge</h3>
                <p className="text-sm" style={{ color: colors.textSecondary }}>
                  RWH helps replenish declining groundwater levels and maintains water table for communities.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}