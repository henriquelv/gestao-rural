
export enum Sector {
  ORDENHA = 'Ordenha',
  MANEJO = 'Manejo',
  ALIMENTACAO = 'Alimentação',
  CONFORTO = 'Conforto',
  SERVICOS_EXTERNOS = 'Serviços Externos',
  ADMINISTRACAO = 'Administração',
  MATERNIDADE = 'Maternidade',
  CRIACAO = 'Criação'
}

export const DEFAULT_SECTORS = Object.values(Sector);

export interface MediaItem {
  id: string;
  type: 'photo' | 'video' | 'audio' | 'pdf' | 'doc' | 'ppt';
  localPath?: string;
  mimeType?: string;
  size?: number;
  name?: string;
  remotePath?: string;
  remoteUrl?: string;
  uri?: string;
}

export interface FarmSettings {
  farmName: string;
  farmLogoUri?: string; // Base64
  ownerName?: string;
  headerTextColor?: string; // New: Custom header text color
}

export type AppColor = 'blue' | 'green' | 'red' | 'orange' | 'purple' | 'gray' | 'slate' | 'pink' | 'yellow';
export type AppIcon = 'alert' | 'file' | 'megaphone' | 'chart' | 'trending' | 'book' | 'settings' | 'plus' | 'list' | 'droplet' | 'activity' | 'ban' | 'baby' | 'tractor' | 'users' | 'clipboard' | 'wrench' | 'truck' | 'box' | 'calendar' | 'check' | 'sun' | 'moon' | 'cloud' | 'thermometer' | 'wind' | 'map-pin' | 'phone' | 'mail' | 'search' | 'trash' | 'edit' | 'save' | 'camera' | 'video' | 'mic' | 'play' | 'pause' | 'stop' | 'volume-2' | 'wifi' | 'battery' | 'bluetooth' | 'cpu' | 'database' | 'hard-drive' | 'server' | 'smartphone' | 'monitor' | 'printer' | 'speaker' | 'headphones' | 'watch' | 'scissors' | 'key' | 'lock' | 'unlock' | 'shield' | 'star' | 'heart' | 'thumbs-up' | 'thumbs-down' | 'smile' | 'frown' | 'meh' | 'help-circle' | 'info' | 'alert-circle' | 'check-circle' | 'x-circle' | 'arrow-right' | 'arrow-left' | 'arrow-up' | 'arrow-down' | 'chevron-right' | 'chevron-left' | 'chevron-up' | 'chevron-down' | 'menu' | 'more-horizontal' | 'more-vertical' | 'loader' | 'refresh-cw' | 'upload' | 'download' | 'share' | 'external-link' | 'link' | 'paperclip' | 'map' | 'navigation' | 'compass' | 'anchor' | 'flag' | 'bookmark' | 'tag' | 'hash' | 'percent' | 'dollar-sign' | 'credit-card' | 'shopping-cart' | 'gift' | 'package' | 'truck' | 'clock' | 'bell' | 'eye' | 'eye-off' | 'user' | 'users' | 'user-plus' | 'user-minus' | 'user-check' | 'user-x' | 'presentation';

export type BlockType = 'button' | 'header' | 'text' | 'card';

export interface UIBlock {
  id: string;
  screen: string;
  type: BlockType;
  label: string; 
  content?: string;
  color: AppColor;
  iconType: 'lucide' | 'custom';
  iconValue: string;
  route: string;
  order: number;
  visible: boolean;
}

export type ButtonConfig = UIBlock; 

export interface CustomPage {
  id: string;
  title: string;
}

export interface UIConfig {
  buttons: UIBlock[];
  customPages: CustomPage[]; 
}

export interface Anomaly {
  id: string;
  createdAt: string;
  responsible: string;
  sector: string; 
  description: string;
  immediateSolution: string;
  media: MediaItem[];
  resolvedAt?: string;
  resolvedBy?: string;
}

export interface Instruction {
  id: string;
  createdAt: string;
  title: string;
  sector: string;
  description: string;
  media: MediaItem[]; 
}

export interface Notice {
  id: string;
  createdAt: string;
  responsible: string;
  content: string;
  media: MediaItem[];
}

export interface Improvement {
  id: string;
  createdAt: string;
  employee: string;
  sector: string;
  description: string;
  media: MediaItem[];
}

export interface FarmDoc {
  id: string; 
  updatedAt: string;
  title: string; 
  sector: string; 
  responsible?: string; // Added field
  media: MediaItem | null;
}

export interface DailyMilk {
  date: string; 
  liters: number;
}

export interface DailyMetric {
  date: string;
  type: 'lactation' | 'discard' | 'births';
  value: number;
}

export interface MonthlyStats {
  monthKey: string; 
  lactatingCows: number;
  discardedCows: number;
  births: number;
}

export interface Employee {
  id: string;
  name: string;
  role: string;
  photoUri?: string;
}

export type RootStackParamList = {
  Home: undefined;
  AnomaliesMenu: undefined;
  AddAnomaly: { fixedTimestamp: string };
  ListAnomalies: undefined;
  AnomalyDetail: { id: string };
  WorkInstructions: undefined;
  Notices: undefined;
  Settings: undefined;
  FarmNorms: undefined;
  FarmData: undefined;
  Improvements: undefined;
};
