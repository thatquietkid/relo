export type AaarrrMetricKey = 'acquisition' | 'activation' | 'retention' | 'referral' | 'revenue';
export interface MetricDefinition { key: AaarrrMetricKey; label: string; sourceEvents: string[]; numerator: string; denominator: string; defaultWindow: '30d'; }
export const AARRR_METRICS: Record<AaarrrMetricKey, MetricDefinition> = {
  acquisition: { key: 'acquisition', label: 'Acquisition', sourceEvents: ['EmployeeInvited'], numerator: 'EmployeeInvited', denominator: 'TenantCreated', defaultWindow: '30d' },
  activation: { key: 'activation', label: 'Activation', sourceEvents: ['EmployeeInvited', 'RelocationCaseActivated'], numerator: 'RelocationCaseActivated', denominator: 'EmployeeInvited', defaultWindow: '30d' },
  retention: { key: 'retention', label: 'Retention', sourceEvents: ['RelocationCaseActivated', 'ChecklistItemCompleted'], numerator: 'ChecklistItemCompleted', denominator: 'RelocationCaseActivated', defaultWindow: '30d' },
  referral: { key: 'referral', label: 'Referral', sourceEvents: ['ProviderRequestSubmitted', 'ReferralAccepted'], numerator: 'ReferralAccepted', denominator: 'ProviderRequestSubmitted', defaultWindow: '30d' },
  revenue: { key: 'revenue', label: 'Revenue', sourceEvents: ['ProgramActivated', 'ReportExported'], numerator: 'ProgramActivated', denominator: 'ReportExported', defaultWindow: '30d' },
};
