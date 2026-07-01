
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
  pendingUpload?: boolean;
}

export interface Farm {
  id: string;
  name: string;
  status: 'active' | 'blocked' | 'expired' | string;
  activation_code?: string;
  max_devices?: number;
  grace_period_days?: number;
  expires_at?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface License {
  id: string;
  farm_id: string;
  status: 'active' | 'blocked' | 'expired' | string;
  starts_at?: string;
  expires_at?: string | null;
  notes?: string;
  created_at?: string;
  updated_at?: string;
}

export interface DeviceRegistration {
  id?: string;
  farm_id: string;
  employee_id: string;
  device_id: string;
  device_name?: string;
  platform?: string;
  status: 'active' | 'blocked' | string;
  first_seen_at?: string;
  last_seen_at?: string;
}

export interface AppActivationContext {
  farm_id: string;
  farm_name: string;
  employee_id: string;
  employee_name: string;
  device_id: string;
  last_license_check_at?: string;
  license_status?: string;
  device_status?: string;
  grace_period_days?: number;
  is_owner?: boolean;
  admin_pin?: string;
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
  farm_id?: string;
  employee_id?: string;
  employee_name?: string;
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
  farm_id?: string;
  employee_id?: string;
  employee_name?: string;
  createdAt: string;
  title: string;
  sector: string;
  description: string;
  media: MediaItem[]; 
}

export interface Notice {
  id: string;
  farm_id?: string;
  employee_id?: string;
  employee_name?: string;
  createdAt: string;
  responsible: string;
  content: string;
  media: MediaItem[];
}

export interface Improvement {
  id: string;
  farm_id?: string;
  employee_id?: string;
  employee_name?: string;
  createdAt: string;
  employee: string;
  sector: string;
  description: string;
  media: MediaItem[];
}

export interface FarmDoc {
  id: string; 
  farm_id?: string;
  employee_id?: string;
  employee_name?: string;
  updatedAt: string;
  title: string; 
  sector: string; 
  responsible?: string; // Added field
  media: MediaItem | null;
}

export interface DailyMilk {
  farm_id?: string;
  date: string; 
  liters: number;
}

export interface DailyMetric {
  farm_id?: string;
  date: string;
  type: 'lactation' | 'discard' | 'births';
  value: number;
}

export interface MonthlyStats {
  farm_id?: string;
  monthKey: string; 
  lactatingCows: number;
  discardedCows: number;
  births: number;
}

export interface Employee {
  id: string;
  farm_id?: string;
  name: string;
  role: string;
  status?: string;
  created_at?: string;
  updated_at?: string;
  photoUri?: string;
  is_admin?: boolean;
  admin_pin?: string;
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
