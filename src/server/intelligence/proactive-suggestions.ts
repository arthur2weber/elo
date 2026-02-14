import { runGeminiApiPrompt } from '../../ai/gemini-api';
import { TrendAnalyzer, DegradationAlert } from '../monitoring/trend-analyzer';
import { BaselineCalculator, BaselineAlert } from '../monitoring/baseline-calculator';
import { MetricsStore } from '../monitoring/metrics-store';
import Database from 'better-sqlite3';

export interface ProactiveSuggestion {
  id: string;
  device_id: string;
  type: 'maintenance' | 'optimization' | 'investigation' | 'monitoring';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  title: string;
  description: string;
  reasoning: string;
  recommendations: string[];
  estimated_effort: 'quick' | 'moderate' | 'complex';
  potential_impact: 'low' | 'medium' | 'high' | 'critical';
  confidence: number; // 0-100
  based_on_data: {
    anomalies?: BaselineAlert[];
    trends?: DegradationAlert[];
    metrics_summary?: any;
  };
  suggested_actions: Array<{
    action: string;
    timeline: 'immediate' | 'this_week' | 'this_month' | 'monitor';
    responsible?: string;
  }>;
  created_at: Date;
  expires_at?: Date;
}

export interface DailyBriefing {
  date: Date;
  summary: string;
  key_insights: string[];
  alerts: ProactiveSuggestion[];
  recommendations: string[];
  health_score: number; // Overall system health 0-100
  next_check_date: Date;
}

export class ProactiveSuggestions {
  private trendAnalyzer: TrendAnalyzer;
  private baselineCalculator: BaselineCalculator;
  private metricsStore: MetricsStore;
  private db: Database.Database;

  constructor(
    trendAnalyzer: TrendAnalyzer,
    baselineCalculator: BaselineCalculator,
    metricsStore: MetricsStore,
    db: Database.Database
  ) {
    this.trendAnalyzer = trendAnalyzer;
    this.baselineCalculator = baselineCalculator;
    this.metricsStore = metricsStore;
    this.db = db;
  }

  /**
   * Generate proactive suggestions based on current system state
   */
  async generateSuggestions(): Promise<ProactiveSuggestion[]> {
    const suggestions: ProactiveSuggestion[] = [];

    // Get all degradation alerts from trend analysis
    const trendAlerts = await this.trendAnalyzer.analyzeAllTrends();

    // Get all anomaly alerts from baseline analysis
    const anomalyAlerts = await this.baselineCalculator.checkAllDevicesForAnomalies();

    // Group alerts by device
    const deviceAlerts = this.groupAlertsByDevice(trendAlerts, anomalyAlerts);

    // Generate suggestions for each device
    for (const [deviceId, alerts] of deviceAlerts.entries()) {
      try {
        const deviceSuggestions = await this.analyzeDeviceState(deviceId, alerts);
        suggestions.push(...deviceSuggestions);
      } catch (error) {
        console.error(`[ProactiveSuggestions] Error analyzing device ${deviceId}:`, error);
      }
    }

    // Filter and prioritize suggestions
    const filteredSuggestions = await this.filterAndPrioritize(suggestions);

    // Store suggestions in database
    await this.storeSuggestions(filteredSuggestions);

    return filteredSuggestions;
  }

  /**
   * Analyze a specific device's state and generate suggestions
   */
  private async analyzeDeviceState(
    deviceId: string,
    alerts: { trends: DegradationAlert[], anomalies: BaselineAlert[] }
  ): Promise<ProactiveSuggestion[]> {
    const suggestions: ProactiveSuggestion[] = [];

    // Get device context
    const deviceMetrics = await this.metricsStore.getDeviceMetrics(deviceId, new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), new Date());
    const availableMetrics = await this.metricsStore.getAvailableMetrics(deviceId);

    // Analyze each metric for the device
    for (const metricName of availableMetrics) {
      const metricAlerts = {
        trends: alerts.trends.filter(t => t.metric_name === metricName),
        anomalies: alerts.anomalies.filter(a => a.metric_name === metricName)
      };

      if (metricAlerts.trends.length > 0 || metricAlerts.anomalies.length > 0) {
        const suggestion = await this.generateMetricSuggestion(deviceId, metricName, metricAlerts);
        if (suggestion) {
          suggestions.push(suggestion);
        }
      }
    }

    // Generate device-level suggestions if no metric-specific ones
    if (suggestions.length === 0 && (alerts.trends.length > 0 || alerts.anomalies.length > 0)) {
      const deviceSuggestion = await this.generateDeviceLevelSuggestion(deviceId, alerts);
      if (deviceSuggestion) {
        suggestions.push(deviceSuggestion);
      }
    }

    return suggestions;
  }

  /**
   * Generate suggestion for a specific metric
   */
  private async generateMetricSuggestion(
    deviceId: string,
    metricName: string,
    alerts: { trends: DegradationAlert[], anomalies: BaselineAlert[] }
  ): Promise<ProactiveSuggestion | null> {
    // Prepare context for Gemini
    const context = this.buildMetricContext(deviceId, metricName, alerts);

    const prompt = `You are an AI maintenance expert analyzing device metrics. Based on the following data, generate a proactive maintenance suggestion.

CONTEXT:
${context}

TASK:
Generate a JSON object with maintenance recommendations. Consider:
- The severity and type of issues detected
- How critical the device/component is
- The effort required for different solutions
- Potential impact if not addressed
- Timeline for action

Return a JSON object in this exact format:
{
  "type": "maintenance|optimization|investigation|monitoring",
  "priority": "low|medium|high|urgent",
  "title": "Brief, actionable title",
  "description": "2-3 sentence explanation",
  "reasoning": "Technical reasoning for the suggestion",
  "recommendations": ["Specific action 1", "Specific action 2"],
  "estimated_effort": "quick|moderate|complex",
  "potential_impact": "low|medium|high|critical",
  "confidence": 85,
  "suggested_actions": [
    {
      "action": "Check air filters",
      "timeline": "this_week",
      "responsible": "homeowner"
    }
  ]
}

Be specific, actionable, and consider safety. Return only the JSON object.`;

    try {
      const response = await runGeminiApiPrompt(prompt);
      const suggestionData = this.parseGeminiResponse(response);

      if (!suggestionData) {
        return null;
      }

      return {
        id: `${deviceId}-${metricName}-${Date.now()}`,
        device_id: deviceId,
        type: suggestionData.type,
        priority: suggestionData.priority,
        title: suggestionData.title,
        description: suggestionData.description,
        reasoning: suggestionData.reasoning,
        recommendations: suggestionData.recommendations,
        estimated_effort: suggestionData.estimated_effort,
        potential_impact: suggestionData.potential_impact,
        confidence: suggestionData.confidence,
        based_on_data: alerts,
        suggested_actions: suggestionData.suggested_actions,
        created_at: new Date(),
        expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days
      };
    } catch (error) {
      console.error(`[ProactiveSuggestions] Error generating suggestion for ${deviceId}:${metricName}:`, error);
      return null;
    }
  }

  /**
   * Generate device-level suggestion when no specific metrics are problematic
   */
  private async generateDeviceLevelSuggestion(
    deviceId: string,
    alerts: { trends: DegradationAlert[], anomalies: BaselineAlert[] }
  ): Promise<ProactiveSuggestion | null> {
    const context = this.buildDeviceContext(deviceId, alerts);

    const prompt = `Analyze the overall device health and suggest proactive maintenance.

${context}

Generate a device-level maintenance suggestion as JSON.`;

    try {
      const response = await runGeminiApiPrompt(prompt);
      const suggestionData = this.parseGeminiResponse(response);

      if (!suggestionData) {
        return null;
      }

      return {
        id: `${deviceId}-device-${Date.now()}`,
        device_id: deviceId,
        type: suggestionData.type,
        priority: suggestionData.priority,
        title: suggestionData.title,
        description: suggestionData.description,
        reasoning: suggestionData.reasoning,
        recommendations: suggestionData.recommendations,
        estimated_effort: suggestionData.estimated_effort,
        potential_impact: suggestionData.potential_impact,
        confidence: suggestionData.confidence,
        based_on_data: alerts,
        suggested_actions: suggestionData.suggested_actions,
        created_at: new Date(),
        expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
      };
    } catch (error) {
      console.error(`[ProactiveSuggestions] Error generating device suggestion for ${deviceId}:`, error);
      return null;
    }
  }

  /**
   * Build context string for metric-specific analysis
   */
  private buildMetricContext(
    deviceId: string,
    metricName: string,
    alerts: { trends: DegradationAlert[], anomalies: BaselineAlert[] }
  ): string {
    let context = `Device: ${deviceId}\nMetric: ${metricName}\n\n`;

    if (alerts.trends.length > 0) {
      context += 'TREND ANALYSIS:\n';
      alerts.trends.forEach(trend => {
        context += `- ${trend.alert_type}: ${trend.message}\n`;
        context += `  Severity: ${trend.severity}, Estimated time to issue: ${trend.estimated_time_to_issue} days\n`;
      });
    }

    if (alerts.anomalies.length > 0) {
      context += '\nANOMALY DETECTION:\n';
      alerts.anomalies.forEach(anomaly => {
        context += `- ${anomaly.alert_type}: ${anomaly.message}\n`;
        context += `  Severity: ${anomaly.severity}\n`;
      });
    }

    return context;
  }

  /**
   * Build context string for device-level analysis
   */
  private buildDeviceContext(
    deviceId: string,
    alerts: { trends: DegradationAlert[], anomalies: BaselineAlert[] }
  ): string {
    let context = `Device: ${deviceId}\nOverall Status:\n`;

    const trendSeverities = alerts.trends.map(t => t.severity);
    const anomalySeverities = alerts.anomalies.map(a => a.severity);

    const maxTrendSeverity = this.getMaxSeverity(trendSeverities);
    const maxAnomalySeverity = this.getMaxSeverity(anomalySeverities);

    context += `- Trend alerts: ${alerts.trends.length} (max severity: ${maxTrendSeverity})\n`;
    context += `- Anomaly alerts: ${alerts.anomalies.length} (max severity: ${maxAnomalySeverity})\n`;

    return context;
  }

  /**
   * Get maximum severity from array
   */
  private getMaxSeverity(severities: string[]): string {
    const severityOrder = { 'low': 1, 'medium': 2, 'high': 3, 'critical': 4 };
    const maxSeverity = severities.reduce((max, severity) => {
      return severityOrder[severity as keyof typeof severityOrder] > severityOrder[max as keyof typeof severityOrder] ? severity : max;
    }, 'low');
    return maxSeverity;
  }

  /**
   * Parse Gemini JSON response
   */
  private parseGeminiResponse(response: string): any {
    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        console.error('[ProactiveSuggestions] No JSON found in Gemini response');
        return null;
      }

      return JSON.parse(jsonMatch[0]);
    } catch (error) {
      console.error('[ProactiveSuggestions] Failed to parse Gemini response:', error);
      return null;
    }
  }

  /**
   * Group alerts by device
   */
  private groupAlertsByDevice(
    trendAlerts: DegradationAlert[],
    anomalyAlerts: BaselineAlert[]
  ): Map<string, { trends: DegradationAlert[], anomalies: BaselineAlert[] }> {
    const deviceMap = new Map<string, { trends: DegradationAlert[], anomalies: BaselineAlert[] }>();

    // Group trend alerts
    trendAlerts.forEach(alert => {
      if (!deviceMap.has(alert.device_id)) {
        deviceMap.set(alert.device_id, { trends: [], anomalies: [] });
      }
      deviceMap.get(alert.device_id)!.trends.push(alert);
    });

    // Group anomaly alerts
    anomalyAlerts.forEach(alert => {
      if (!deviceMap.has(alert.device_id)) {
        deviceMap.set(alert.device_id, { trends: [], anomalies: [] });
      }
      deviceMap.get(alert.device_id)!.anomalies.push(alert);
    });

    return deviceMap;
  }

  /**
   * Filter and prioritize suggestions
   */
  private async filterAndPrioritize(suggestions: ProactiveSuggestion[]): Promise<ProactiveSuggestion[]> {
    // Remove duplicates and low-confidence suggestions
    const filtered = suggestions.filter(s => s.confidence > 60);

    // Sort by priority and confidence
    const priorityOrder = { 'urgent': 4, 'high': 3, 'medium': 2, 'low': 1 };

    filtered.sort((a, b) => {
      const priorityDiff = priorityOrder[b.priority] - priorityOrder[a.priority];
      if (priorityDiff !== 0) return priorityDiff;
      return b.confidence - a.confidence;
    });

    // Limit to top 20 suggestions to avoid overwhelming
    return filtered.slice(0, 20);
  }

  /**
   * Store suggestions in database
   */
  private async storeSuggestions(suggestions: ProactiveSuggestion[]): Promise<void> {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO proactive_suggestions (
        id, device_id, type, priority, title, description, reasoning,
        recommendations, estimated_effort, potential_impact, confidence,
        based_on_data, suggested_actions, created_at, expires_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const suggestion of suggestions) {
      stmt.run([
        suggestion.id,
        suggestion.device_id,
        suggestion.type,
        suggestion.priority,
        suggestion.title,
        suggestion.description,
        suggestion.reasoning,
        JSON.stringify(suggestion.recommendations),
        suggestion.estimated_effort,
        suggestion.potential_impact,
        suggestion.confidence,
        JSON.stringify(suggestion.based_on_data),
        JSON.stringify(suggestion.suggested_actions),
        suggestion.created_at.toISOString(),
        suggestion.expires_at?.toISOString()
      ]);
    }
  }

  /**
   * Generate daily briefing
   */
  async generateDailyBriefing(): Promise<DailyBriefing> {
    const today = new Date();
    const suggestions = await this.getActiveSuggestions();

    // Calculate overall health score
    const healthScore = await this.calculateOverallHealthScore();

    // Generate summary using Gemini
    const summary = await this.generateBriefingSummary(suggestions, healthScore);

    // Get key insights
    const keyInsights = await this.extractKeyInsights(suggestions);

    // Get recommendations
    const recommendations = this.extractRecommendations(suggestions);

    return {
      date: today,
      summary,
      key_insights: keyInsights,
      alerts: suggestions.filter(s => s.priority === 'urgent' || s.priority === 'high'),
      recommendations,
      health_score: healthScore,
      next_check_date: new Date(today.getTime() + 24 * 60 * 60 * 1000)
    };
  }

  /**
   * Get active suggestions from database
   */
  async getActiveSuggestions(): Promise<ProactiveSuggestion[]> {
    const stmt = this.db.prepare(`
      SELECT * FROM proactive_suggestions
      WHERE expires_at > ?
      ORDER BY
        CASE priority
          WHEN 'urgent' THEN 4
          WHEN 'high' THEN 3
          WHEN 'medium' THEN 2
          WHEN 'low' THEN 1
        END DESC,
        confidence DESC
      LIMIT 50
    `);

    const rows = stmt.all(new Date().toISOString()) as any[];

    return rows.map(row => ({
      id: row.id,
      device_id: row.device_id,
      type: row.type,
      priority: row.priority,
      title: row.title,
      description: row.description,
      reasoning: row.reasoning,
      recommendations: JSON.parse(row.recommendations),
      estimated_effort: row.estimated_effort,
      potential_impact: row.potential_impact,
      confidence: row.confidence,
      based_on_data: JSON.parse(row.based_on_data),
      suggested_actions: JSON.parse(row.suggested_actions),
      created_at: new Date(row.created_at),
      expires_at: row.expires_at ? new Date(row.expires_at) : undefined
    }));
  }

  /**
   * Calculate overall system health score
   */
  private async calculateOverallHealthScore(): Promise<number> {
    // Get all devices with metrics
    const devices = await this.getDevicesWithMetrics();
    let totalScore = 0;
    let deviceCount = 0;

    for (const deviceId of devices) {
      const metrics = await this.metricsStore.getAvailableMetrics(deviceId);

      for (const metricName of metrics) {
        const trendSummary = await this.trendAnalyzer.getTrendSummary(deviceId, metricName);
        totalScore += trendSummary.health_score;
        deviceCount++;
      }
    }

    return deviceCount > 0 ? Math.round(totalScore / deviceCount) : 100;
  }

  /**
   * Generate briefing summary using Gemini
   */
  private async generateBriefingSummary(suggestions: ProactiveSuggestion[], healthScore: number): Promise<string> {
    const context = `System Health Score: ${healthScore}/100
Active Suggestions: ${suggestions.length}
Urgent Items: ${suggestions.filter(s => s.priority === 'urgent').length}
High Priority Items: ${suggestions.filter(s => s.priority === 'high').length}

Top Issues:
${suggestions.slice(0, 5).map(s => `- ${s.title} (${s.device_id})`).join('\n')}`;

    const prompt = `Generate a concise daily briefing summary for a smart home system.

${context}

Write a brief, friendly summary (2-3 sentences) that covers:
1. Overall system health
2. Key concerns or improvements needed
3. Next steps or recommendations

Keep it conversational and actionable.`;

    try {
      return await runGeminiApiPrompt(prompt);
    } catch (error) {
      return `System health is at ${healthScore}%. ${suggestions.length} maintenance suggestions are active. Focus on the highest priority items first.`;
    }
  }

  /**
   * Extract key insights from suggestions
   */
  private async extractKeyInsights(suggestions: ProactiveSuggestion[]): Promise<string[]> {
    const insights: string[] = [];

    // Group by type
    const byType = suggestions.reduce((acc, s) => {
      if (!acc[s.type]) acc[s.type] = [];
      acc[s.type].push(s);
      return acc;
    }, {} as Record<string, ProactiveSuggestion[]>);

    for (const [type, typeSuggestions] of Object.entries(byType)) {
      if (typeSuggestions.length > 0) {
        insights.push(`${typeSuggestions.length} ${type} suggestions, ${typeSuggestions.filter(s => s.priority === 'urgent' || s.priority === 'high').length} high priority`);
      }
    }

    // Add specific device insights
    const deviceIssues = suggestions.reduce((acc, s) => {
      acc[s.device_id] = (acc[s.device_id] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const topDevices = Object.entries(deviceIssues)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 3);

    if (topDevices.length > 0) {
      insights.push(`Most affected devices: ${topDevices.map(([device, count]) => `${device} (${count} issues)`).join(', ')}`);
    }

    return insights;
  }

  /**
   * Extract recommendations from suggestions
   */
  private extractRecommendations(suggestions: ProactiveSuggestion[]): string[] {
    const recommendations: string[] = [];

    // Get top 5 recommendations from highest priority suggestions
    const topSuggestions = suggestions
      .filter(s => s.priority === 'urgent' || s.priority === 'high')
      .slice(0, 5);

    for (const suggestion of topSuggestions) {
      recommendations.push(...suggestion.recommendations.slice(0, 2)); // Top 2 per suggestion
    }

    // Remove duplicates and limit to 10
    return [...new Set(recommendations)].slice(0, 10);
  }

  /**
   * Get devices that have metrics data
   */
  private async getDevicesWithMetrics(): Promise<string[]> {
    const stmt = this.db.prepare(`
      SELECT DISTINCT device_id
      FROM device_metrics
      ORDER BY device_id
    `);

    const rows = stmt.all() as any[];
    return rows.map(row => row.device_id);
  }

  /**
   * Clean up expired suggestions
   */
  async cleanupExpiredSuggestions(): Promise<number> {
    const stmt = this.db.prepare('DELETE FROM proactive_suggestions WHERE expires_at < ?');
    const result = stmt.run(new Date().toISOString());
    return result.changes;
  }
}