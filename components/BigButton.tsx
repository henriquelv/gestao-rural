
import React from 'react';
import { 
  AlertTriangle, FileText, Megaphone, Settings, Book, BarChart3, TrendingUp, 
  Plus, List, Droplets, Activity, Ban, Baby, Tractor, Users, ClipboardList,
  Wrench, Truck, Box, Calendar, CheckCircle, Presentation,
  Sun, Moon, Cloud, Thermometer, Wind, MapPin, Phone, Mail, Search, Trash, Edit, Save, 
  Camera, Video, Mic, Play, Pause, Square, Volume2, Wifi, Battery, Bluetooth, Cpu, Database, 
  HardDrive, Server, Smartphone, Monitor, Printer, Speaker, Headphones, Watch, Scissors, Key, 
  Lock, Unlock, Shield, Star, Heart, ThumbsUp, ThumbsDown, Smile, Frown, Meh, HelpCircle, 
  Info, AlertCircle, XCircle, ArrowRight, ArrowLeft, ArrowUp, ArrowDown, ChevronRight, 
  ChevronLeft, ChevronUp, ChevronDown, Menu, MoreHorizontal, MoreVertical, Loader, RefreshCw, 
  Upload, Download, Share, ExternalLink, Link, Paperclip, Map, Navigation, Compass, Anchor, 
  Flag, Bookmark, Tag, Hash, Percent, DollarSign, CreditCard, ShoppingCart, Gift, Package, 
  Clock, Bell, Eye, EyeOff, User, UserPlus, UserMinus, UserCheck, UserX
} from 'lucide-react';
import { AppColor } from '../types';

interface BigButtonProps {
  icon: any; // Can be a string name, a component, or a Base64 URI
  iconType?: 'lucide' | 'custom';
  label: string;
  onClick: () => void;
  variant?: string; // Legacy
  color?: AppColor | string;
  fullWidth?: boolean;
}

const IconMap: Record<string, any> = {
  // Existing
  'alert': AlertTriangle,
  'file': FileText,
  'megaphone': Megaphone,
  'settings': Settings,
  'book': Book,
  'chart': BarChart3,
  'trending': TrendingUp,
  'plus': Plus,
  'list': List,
  'droplet': Droplets,
  'activity': Activity,
  'ban': Ban,
  'baby': Baby,
  'tractor': Tractor,
  'users': Users,
  'clipboard': ClipboardList,
  'wrench': Wrench,
  'truck': Truck,
  'box': Box,
  'calendar': Calendar,
  'check': CheckCircle,
  'presentation': Presentation,

  // New Additions (Nature/Env)
  'sun': Sun,
  'moon': Moon,
  'cloud': Cloud,
  'thermometer': Thermometer,
  'wind': Wind,
  'map-pin': MapPin,

  // Tech/Objects
  'phone': Phone,
  'mail': Mail,
  'search': Search,
  'trash': Trash,
  'edit': Edit,
  'save': Save,
  'camera': Camera,
  'video': Video,
  'mic': Mic,
  'play': Play,
  'pause': Pause,
  'stop': Square, // Lucide 'square' acts as stop usually, or Octagon
  'volume-2': Volume2,
  'wifi': Wifi,
  'battery': Battery,
  'bluetooth': Bluetooth,
  'cpu': Cpu,
  'database': Database,
  'hard-drive': HardDrive,
  'server': Server,
  'smartphone': Smartphone,
  'monitor': Monitor,
  'printer': Printer,
  'speaker': Speaker,
  'headphones': Headphones,
  'watch': Watch,
  'scissors': Scissors,
  'key': Key,
  'lock': Lock,
  'unlock': Unlock,
  'shield': Shield,

  // Social/Emotes
  'star': Star,
  'heart': Heart,
  'thumbs-up': ThumbsUp,
  'thumbs-down': ThumbsDown,
  'smile': Smile,
  'frown': Frown,
  'meh': Meh,
  'help-circle': HelpCircle,
  'info': Info,
  'alert-circle': AlertCircle,
  'check-circle': CheckCircle,
  'x-circle': XCircle,

  // UI/Arrows
  'arrow-right': ArrowRight,
  'arrow-left': ArrowLeft,
  'arrow-up': ArrowUp,
  'arrow-down': ArrowDown,
  'chevron-right': ChevronRight,
  'chevron-left': ChevronLeft,
  'chevron-up': ChevronUp,
  'chevron-down': ChevronDown,
  'menu': Menu,
  'more-horizontal': MoreHorizontal,
  'more-vertical': MoreVertical,
  'loader': Loader,
  'refresh-cw': RefreshCw,
  'upload': Upload,
  'download': Download,
  'share': Share,
  'external-link': ExternalLink,
  'link': Link,
  'paperclip': Paperclip,
  
  // Maps/Nav
  'map': Map,
  'navigation': Navigation,
  'compass': Compass,
  'anchor': Anchor,
  'flag': Flag,
  'bookmark': Bookmark,
  'tag': Tag,

  // Finance/Commerce
  'hash': Hash,
  'percent': Percent,
  'dollar-sign': DollarSign,
  'credit-card': CreditCard,
  'shopping-cart': ShoppingCart,
  'gift': Gift,
  'package': Package,

  // Misc
  'clock': Clock,
  'bell': Bell,
  'eye': Eye,
  'eye-off': EyeOff,
  'user': User,
  'user-plus': UserPlus,
  'user-minus': UserMinus,
  'user-check': UserCheck,
  'user-x': UserX
};

export const BigButton: React.FC<BigButtonProps> = ({ 
  icon, 
  iconType = 'lucide',
  label, 
  onClick, 
  color = 'blue',
  fullWidth = true
}) => {
  
  // Resolve Styles
  const colorMap: Record<string, string> = {
    blue: 'bg-blue-600 border-blue-800 text-white',
    green: 'bg-green-600 border-green-800 text-white',
    red: 'bg-red-600 border-red-800 text-white',
    orange: 'bg-orange-500 border-orange-700 text-white',
    purple: 'bg-purple-600 border-purple-800 text-white',
    gray: 'bg-slate-200 border-slate-300 text-slate-700',
    slate: 'bg-slate-600 border-slate-800 text-white',
    pink: 'bg-pink-600 border-pink-800 text-white',
    yellow: 'bg-yellow-500 border-yellow-700 text-white',
  };

  const heroMap: Record<string, string> = {
    blue: 'bg-gradient-to-br from-blue-500 to-blue-700 text-white border-blue-800 shadow-lg',
    green: 'bg-gradient-to-br from-green-500 to-green-700 text-white border-green-800 shadow-lg',
    red: 'bg-gradient-to-br from-red-500 to-red-700 text-white border-red-800 shadow-lg',
    orange: 'bg-gradient-to-br from-orange-500 to-orange-700 text-white border-orange-800 shadow-lg',
    purple: 'bg-gradient-to-br from-purple-500 to-purple-700 text-white border-purple-800 shadow-lg',
    gray: 'bg-slate-200 border-slate-300 text-slate-700 shadow-sm',
    slate: 'bg-gradient-to-br from-slate-500 to-slate-700 text-white border-slate-800 shadow-lg',
    pink: 'bg-gradient-to-br from-pink-500 to-pink-700 text-white border-pink-800 shadow-lg',
    yellow: 'bg-gradient-to-br from-yellow-400 to-yellow-600 text-white border-yellow-700 shadow-lg',
  };

  const theme = colorMap[color as string] ? color as string : 'blue';
  const buttonClasses = heroMap[theme] || heroMap['blue'];
  
  let iconContainerClasses = '';
  if (theme === 'gray') {
    iconContainerClasses = 'bg-black/5 border-black/5 text-slate-600';
  } else {
    iconContainerClasses = 'bg-white/20 border-white/30 text-white shadow-inner';
  }

  // Render Icon logic
  let RenderedIcon;
  if (iconType === 'custom' && typeof icon === 'string') {
    // It's an image URL/Base64
    // Added p-2 and object-contain to ensure custom images/icons look good inside the container
    RenderedIcon = <img src={icon} alt="" className="w-full h-full object-contain p-1" />;
  } else {
    // It's a lucide icon name or component
    const IconComponent = typeof icon === 'string' ? (IconMap[icon] || AlertTriangle) : icon;
    RenderedIcon = <IconComponent size={fullWidth ? 36 : 32} strokeWidth={2.5} className="drop-shadow-sm" />;
  }

  return (
    <button
      onClick={onClick}
      className={`
        relative overflow-hidden group w-full
        flex flex-col items-center justify-center
        py-5 px-2 rounded-3xl border-b-[6px]
        active:border-b-0 active:translate-y-[6px] active:shadow-none
        transition-all duration-200
        ${buttonClasses}
        ${fullWidth ? 'mb-0' : 'aspect-square mb-0'}
      `}
    >
      <div className={`
        relative z-10 flex items-center justify-center
        ${fullWidth ? 'w-16 h-16' : 'w-14 h-14'} rounded-2xl mb-2 border-2 backdrop-blur-md overflow-hidden
        ${iconContainerClasses}
      `}>
        {RenderedIcon}
      </div>

      <span className={`
        relative z-10 
        ${fullWidth ? 'text-xl' : 'text-sm'} 
        font-black uppercase text-center leading-tight tracking-tight drop-shadow-md break-words w-full px-1
      `}>
        {label}
      </span>
    </button>
  );
};
