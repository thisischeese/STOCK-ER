export type NavigationTab = 'forecast' | 'inventory' | 'aiops' | 'serving';
export type TabType = 'overview' | 'sales' | 'inventory' | 'operations' | NavigationTab;

export type PlatformId = 'all' | 'brandi' | 'zigzag' | 'ably';

// Legacy compatibility types
export interface ChartDataPoint {
  date: string;
  actual: number;
  predicted: number;
}
export type PlatformMetric = PlatformSummary;
export type ProductInventoryItem = FashionProductItem;
export interface ModelQualityRow {
  platform: string;
  sampleWape: number;
  thresholdText: string;
  statusText: string;
  isDrift: boolean;
}
export interface AIOpsWorkflowStep {
  step: string;
  title: string;
  subtitle: string;
  isActive: boolean;
  isPassed: boolean;
}

export interface PlatformSummary {
  id: PlatformId;
  name: string;
  deliveryService: string;
  tomorrowPredicted: number;
  expectedSales: number;
  currentStock: number;
  wape21d: number;
  wape: number;
  prevWape: number;
  hasDrift: boolean;
  status: 'normal' | 'warning' | 'urgent';
  statusText: string;
  modelVersion: string;
  description: string;
  recentInputDesc?: string;
  nextAction?: string;
}

export interface DailySalesDataPoint {
  date: string;
  dayOfWeek: string;
  isWeekend: boolean;
  actual: number;
  predicted: number;
  driftOccurred?: boolean;
}

export interface FashionProductItem {
  id: string;
  sku: string;
  name: string;
  category: string;
  primaryChannel: string;
  salesShare: number;
  threeDaysDemand: number;
  currentStock: number;
  incomingStock: number;
  safetyStock: number;
  recommendedRestock: number;
  wholesalePrice: number;
  leadTimeDays: number;
  stockStatus: 'normal' | 'low' | 'urgent';
}

export interface PipelineWorkflowStep {
  stepNumber: string;
  name: string;
  status: 'completed' | 'running' | 'waiting' | 'failed';
  timestamp: string;
  description: string;
  metricLabel: string;
  metricValue: string;
}

export interface ModelRegistryVersion {
  version: string;
  stage: 'Production' | 'Staging' | 'Archived';
  architecture: string;
  valWape: number;
  registeredAt: string;
  promotedBy: string;
  servingPort: number;
  isCurrentServing: boolean;
}

export interface ServingInstanceStatus {
  id: string;
  name: string;
  endpointUrl: string;
  port: number;
  type: 'Local' | 'Container';
  status: 'healthy' | 'warning' | 'down';
  latencyMs: number;
  uptime: string;
  activeModel: string;
}

export interface SidecarReport {
  id: string;
  issuedAt: string;
  title: string;
  threeLineSummary: [string, string, string];
  targetChannel: string;
  wapeRecovery: string;
}
