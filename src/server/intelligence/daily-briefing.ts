import { runGeminiApiPrompt } from '../../ai/gemini-api';
import { ProactiveSuggestions, DailyBriefing, ProactiveSuggestion } from './proactive-suggestions';
import { MetricsStore } from '../monitoring/metrics-store';
import { TrendAnalyzer } from '../monitoring/trend-analyzer';
import { BaselineCalculator } from '../monitoring/baseline-calculator';
import Database from 'better-sqlite3';

export interface BriefingSection {
  title: string;
  content: string;
  priority: 'low' | 'medium' | 'high';
  items?: string[];
}

export interface DailyMetrics {
  total_devices: number;
  active_devices: number;
  total_events: number;
  anomalies_detected: number;
  suggestions_generated: number;
  system_health_score: number;
  top_performing_devices: Array<{device_id: string, health_score: number}>;
  concerning_devices: Array<{device_id: string, issues: number}>;
}

export class DailyBriefingGenerator {
  private proactiveSuggestions: ProactiveSuggestions;
  private metricsStore: MetricsStore;
  private trendAnalyzer: TrendAnalyzer;
  private baselineCalculator: BaselineCalculator;
  private db: Database.Database;

  constructor(
    proactiveSuggestions: ProactiveSuggestions,
    metricsStore: MetricsStore,
    trendAnalyzer: TrendAnalyzer,
    baselineCalculator: BaselineCalculator,
    db: Database.Database
  ) {
    this.proactiveSuggestions = proactiveSuggestions;
    this.metricsStore = metricsStore;
    this.trendAnalyzer = trendAnalyzer;
    this.baselineCalculator = baselineCalculator;
    this.db = db;
  }

  /**
   * Generate comprehensive daily briefing
   */
  async generateDailyBriefing(): Promise<DailyBriefing> {
    console.log('[DailyBriefing] Generating comprehensive daily briefing...');

    // Get base briefing from proactive suggestions
    const baseBriefing = await this.proactiveSuggestions.generateDailyBriefing();

    // Enhance with additional insights
    const metrics = await this.collectDailyMetrics();
    const sections = await this.generateBriefingSections(metrics);
    const enhancedSummary = await this.enhanceSummary(baseBriefing.summary, metrics, sections);

    return {
      ...baseBriefing,
      summary: enhancedSummary,
      key_insights: [...baseBriefing.key_insights, ...this.extractAdditionalInsights(metrics)],
      recommendations: [...baseBriefing.recommendations, ...this.generateAdditionalRecommendations(metrics)]
    };
  }

  /**
   * Collect comprehensive daily metrics
   */
  private async collectDailyMetrics(): Promise<DailyMetrics> {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

    // Get device counts
    const totalDevices = await this.getTotalDeviceCount();
    const activeDevices = await this.getActiveDeviceCount(yesterday);

    // Get event counts
    const totalEvents = await this.getEventCount(yesterday);

    // Get anomaly counts
    const anomaliesDetected = await this.getAnomalyCount(yesterday);

    // Get suggestion counts
    const suggestionsGenerated = await this.getSuggestionCount(yesterday);

    // Calculate system health
    const systemHealthScore = await this.calculateSystemHealthScore();

    // Get top and concerning devices
    const topPerformingDevices = await this.getTopPerformingDevices(5);
    const concerningDevices = await this.getConcerningDevices(5);

    return {
      total_devices: totalDevices,
      active_devices: activeDevices,
      total_events: totalEvents,
      anomalies_detected: anomaliesDetected,
      suggestions_generated: suggestionsGenerated,
      system_health_score: systemHealthScore,
      top_performing_devices: topPerformingDevices,
      concerning_devices: concerningDevices
    };
  }

  /**
   * Generate detailed briefing sections
   */
  private async generateBriefingSections(metrics: DailyMetrics): Promise<BriefingSection[]> {
    const sections: BriefingSection[] = [];

    // System Overview Section
    sections.push({
      title: 'System Overview',
      content: `Your smart home has ${metrics.total_devices} devices, with ${metrics.active_devices} active yesterday. The system processed ${metrics.total_events} events and detected ${metrics.anomalies_detected} anomalies.`,
      priority: 'medium'
    });

    // Health Status Section
    const healthStatus = this.getHealthStatusDescription(metrics.system_health_score);
    sections.push({
      title: 'Health Status',
      content: `Overall system health is ${healthStatus} with a score of ${metrics.system_health_score}/100.`,
      priority: metrics.system_health_score < 70 ? 'high' : 'medium'
    });

    // Top Performers Section
    if (metrics.top_performing_devices.length > 0) {
      sections.push({
        title: 'Top Performing Devices',
        content: 'These devices are operating optimally:',
        priority: 'low',
        items: metrics.top_performing_devices.map(d => `${d.device_id} (health: ${d.health_score}%)`)
      });
    }

    // Concerning Devices Section
    if (metrics.concerning_devices.length > 0) {
      sections.push({
        title: 'Devices Needing Attention',
        content: 'These devices have multiple issues that need addressing:',
        priority: 'high',
        items: metrics.concerning_devices.map(d => `${d.device_id} (${d.issues} issues)`)
      });
    }

    // Maintenance Summary Section
    if (metrics.suggestions_generated > 0) {
      sections.push({
        title: 'Maintenance Summary',
        content: `${metrics.suggestions_generated} maintenance suggestions were generated yesterday.`,
        priority: 'medium'
      });
    }

    return sections;
  }

  /**
   * Enhance the base summary with additional context
   */
  private async enhanceSummary(
    baseSummary: string,
    metrics: DailyMetrics,
    sections: BriefingSection[]
  ): Promise<string> {
    const context = `Additional Context:
- System Health: ${metrics.system_health_score}/100
- Active Devices: ${metrics.active_devices}/${metrics.total_devices}
- Events Processed: ${metrics.total_events}
- Anomalies Detected: ${metrics.anomalies_detected}
- Suggestions Generated: ${metrics.suggestions_generated}

Key Sections:
${sections.map(s => `- ${s.title}: ${s.content}`).join('\n')}`;

    const prompt = `Enhance this daily briefing summary with additional context and insights.

ORIGINAL SUMMARY:
${baseSummary}

${context}

Create an improved, comprehensive summary that incorporates all the additional information. Make it conversational, actionable, and highlight the most important points. Keep it to 3-4 sentences.`;

    try {
      return await runGeminiApiPrompt(prompt);
    } catch (error) {
      console.error('[DailyBriefing] Error enhancing summary:', error);
      return baseSummary; // Fallback to original
    }
  }

  /**
   * Extract additional insights from metrics
   */
  private extractAdditionalInsights(metrics: DailyMetrics): string[] {
    const insights: string[] = [];

    // Activity insights
    const activityRate = metrics.total_devices > 0 ? (metrics.active_devices / metrics.total_devices) * 100 : 0;
    if (activityRate < 50) {
      insights.push(`Only ${activityRate.toFixed(0)}% of devices were active yesterday - consider checking inactive devices`);
    } else if (activityRate > 90) {
      insights.push(`High device activity (${activityRate.toFixed(0)}%) indicates the system is being well utilized`);
    }

    // Anomaly insights
    if (metrics.anomalies_detected > 10) {
      insights.push(`High anomaly count (${metrics.anomalies_detected}) suggests potential system-wide issues`);
    } else if (metrics.anomalies_detected === 0) {
      insights.push('No anomalies detected yesterday - system operating normally');
    }

    // Health insights
    if (metrics.system_health_score < 60) {
      insights.push('System health needs immediate attention');
    } else if (metrics.system_health_score > 90) {
      insights.push('System is operating at excellent health levels');
    }

    return insights;
  }

  /**
   * Generate additional recommendations based on metrics
   */
  private generateAdditionalRecommendations(metrics: DailyMetrics): string[] {
    const recommendations: string[] = [];

    if (metrics.system_health_score < 70) {
      recommendations.push('Schedule comprehensive system maintenance');
      recommendations.push('Review and address high-priority device issues');
    }

    if (metrics.anomalies_detected > 5) {
      recommendations.push('Investigate recurring anomalies across devices');
      recommendations.push('Consider baseline recalibration for affected metrics');
    }

    if (metrics.active_devices < metrics.total_devices * 0.5) {
      recommendations.push('Check connectivity and power status of inactive devices');
      recommendations.push('Review device placement and environmental factors');
    }

    if (metrics.suggestions_generated > 10) {
      recommendations.push('Prioritize and schedule maintenance based on suggestion urgency');
      recommendations.push('Consider professional servicing for complex issues');
    }

    return recommendations;
  }

  /**
   * Get health status description
   */
  private getHealthStatusDescription(score: number): string {
    if (score >= 90) return 'excellent';
    if (score >= 80) return 'very good';
    if (score >= 70) return 'good';
    if (score >= 60) return 'fair';
    if (score >= 50) return 'concerning';
    return 'critical';
  }

  /**
   * Get total device count
   */
  private async getTotalDeviceCount(): Promise<number> {
    const stmt = this.db.prepare('SELECT COUNT(*) as count FROM devices');
    const result = stmt.get() as any;
    return result.count || 0;
  }

  /**
   * Get active device count (devices that had events yesterday)
   */
  private async getActiveDeviceCount(since: Date): Promise<number> {
    const stmt = this.db.prepare(`
      SELECT COUNT(DISTINCT device_id) as count
      FROM events
      WHERE timestamp >= ?
    `);
    const result = stmt.get(since.toISOString()) as any;
    return result.count || 0;
  }

  /**
   * Get event count for the period
   */
  private async getEventCount(since: Date): Promise<number> {
    const stmt = this.db.prepare(`
      SELECT COUNT(*) as count
      FROM events
      WHERE timestamp >= ?
    `);
    const result = stmt.get(since.toISOString()) as any;
    return result.count || 0;
  }

  /**
   * Get anomaly count (this would need to be tracked separately)
   * For now, we'll estimate based on baseline alerts
   */
  private async getAnomalyCount(since: Date): Promise<number> {
    // This is a simplified implementation
    // In a real system, you'd have a dedicated anomalies table
    try {
      const alerts = await this.baselineCalculator.checkAllDevicesForAnomalies();
      return alerts.length;
    } catch (error) {
      console.error('[DailyBriefing] Error getting anomaly count:', error);
      return 0;
    }
  }

  /**
   * Get suggestion count for the period
   */
  private async getSuggestionCount(since: Date): Promise<number> {
    const stmt = this.db.prepare(`
      SELECT COUNT(*) as count
      FROM proactive_suggestions
      WHERE created_at >= ?
    `);
    const result = stmt.get(since.toISOString()) as any;
    return result.count || 0;
  }

  /**
   * Calculate overall system health score
   */
  private async calculateSystemHealthScore(): Promise<number> {
    try {
      const suggestions = await this.proactiveSuggestions.getActiveSuggestions();

      // Base score
      let score = 100;

      // Deduct points for high-priority suggestions
      const urgentCount = suggestions.filter(s => s.priority === 'urgent').length;
      const highCount = suggestions.filter(s => s.priority === 'high').length;

      score -= urgentCount * 10; // -10 per urgent suggestion
      score -= highCount * 5;   // -5 per high suggestion

      // Deduct for low health devices
      const devices = await this.getDevicesWithMetrics();
      let lowHealthCount = 0;

      for (const deviceId of devices) {
        const metrics = await this.metricsStore.getAvailableMetrics(deviceId);
        for (const metricName of metrics) {
          const trendSummary = await this.trendAnalyzer.getTrendSummary(deviceId, metricName);
          if (trendSummary.health_score < 60) {
            lowHealthCount++;
          }
        }
      }

      score -= lowHealthCount * 2; // -2 per low-health metric

      return Math.max(0, Math.min(100, score));
    } catch (error) {
      console.error('[DailyBriefing] Error calculating health score:', error);
      return 50; // Default to neutral
    }
  }

  /**
   * Get top performing devices
   */
  private async getTopPerformingDevices(limit: number): Promise<Array<{device_id: string, health_score: number}>> {
    const devices = await this.getDevicesWithMetrics();
    const deviceScores: Array<{device_id: string, health_score: number}> = [];

    for (const deviceId of devices) {
      const metrics = await this.metricsStore.getAvailableMetrics(deviceId);
      let totalScore = 0;
      let metricCount = 0;

      for (const metricName of metrics) {
        const trendSummary = await this.trendAnalyzer.getTrendSummary(deviceId, metricName);
        totalScore += trendSummary.health_score;
        metricCount++;
      }

      if (metricCount > 0) {
        deviceScores.push({
          device_id: deviceId,
          health_score: Math.round(totalScore / metricCount)
        });
      }
    }

    return deviceScores
      .sort((a, b) => b.health_score - a.health_score)
      .slice(0, limit);
  }

  /**
   * Get concerning devices (most issues)
   */
  private async getConcerningDevices(limit: number): Promise<Array<{device_id: string, issues: number}>> {
    const suggestions = await this.proactiveSuggestions.getActiveSuggestions();

    const deviceIssues = suggestions.reduce((acc, suggestion) => {
      acc[suggestion.device_id] = (acc[suggestion.device_id] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return Object.entries(deviceIssues)
      .map(([device_id, issues]) => ({ device_id, issues }))
      .sort((a, b) => b.issues - a.issues)
      .slice(0, limit);
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
   * Generate briefing in different formats
   */
  async generateBriefingText(briefing: DailyBriefing): Promise<string> {
    let text = `🏠 Daily Home Briefing - ${briefing.date.toLocaleDateString()}\n\n`;

    text += `📊 Summary: ${briefing.summary}\n\n`;

    if (briefing.key_insights.length > 0) {
      text += `🔍 Key Insights:\n`;
      briefing.key_insights.forEach(insight => {
        text += `• ${insight}\n`;
      });
      text += '\n';
    }

    if (briefing.alerts.length > 0) {
      text += `🚨 Alerts (${briefing.alerts.length}):\n`;
      briefing.alerts.slice(0, 5).forEach(alert => {
        text += `• ${alert.title} (${alert.device_id})\n`;
      });
      if (briefing.alerts.length > 5) {
        text += `• ... and ${briefing.alerts.length - 5} more\n`;
      }
      text += '\n';
    }

    if (briefing.recommendations.length > 0) {
      text += `💡 Recommendations:\n`;
      briefing.recommendations.slice(0, 5).forEach(rec => {
        text += `• ${rec}\n`;
      });
      text += '\n';
    }

    text += `❤️ System Health: ${briefing.health_score}/100\n`;
    text += `📅 Next Check: ${briefing.next_check_date.toLocaleDateString()}`;

    return text;
  }

  /**
   * Generate briefing as HTML
   */
  async generateBriefingHTML(briefing: DailyBriefing): Promise<string> {
    return `
<!DOCTYPE html>
<html>
<head>
    <title>Daily Home Briefing</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        .header { background: #f0f0f0; padding: 20px; border-radius: 8px; }
        .section { margin: 20px 0; }
        .alert { background: #ffebee; border-left: 4px solid #f44336; padding: 10px; }
        .insight { background: #e3f2fd; border-left: 4px solid #2196f3; padding: 10px; }
        .recommendation { background: #e8f5e8; border-left: 4px solid #4caf50; padding: 10px; }
        .health { font-size: 24px; font-weight: bold; }
    </style>
</head>
<body>
    <div class="header">
        <h1>🏠 Daily Home Briefing</h1>
        <p><strong>Date:</strong> ${briefing.date.toLocaleDateString()}</p>
        <p><strong>System Health:</strong> <span class="health">${briefing.health_score}/100</span></p>
    </div>

    <div class="section">
        <h2>📊 Summary</h2>
        <p>${briefing.summary}</p>
    </div>

    ${briefing.key_insights.length > 0 ? `
    <div class="section">
        <h2>🔍 Key Insights</h2>
        <ul>
            ${briefing.key_insights.map(insight => `<li class="insight">${insight}</li>`).join('')}
        </ul>
    </div>
    ` : ''}

    ${briefing.alerts.length > 0 ? `
    <div class="section">
        <h2>🚨 Alerts (${briefing.alerts.length})</h2>
        <ul>
            ${briefing.alerts.slice(0, 10).map(alert => `<li class="alert"><strong>${alert.title}</strong> (${alert.device_id})<br>${alert.description}</li>`).join('')}
        </ul>
    </div>
    ` : ''}

    ${briefing.recommendations.length > 0 ? `
    <div class="section">
        <h2>💡 Recommendations</h2>
        <ul>
            ${briefing.recommendations.map(rec => `<li class="recommendation">${rec}</li>`).join('')}
        </ul>
    </div>
    ` : ''}

    <div class="section">
        <p><strong>Next Check:</strong> ${briefing.next_check_date.toLocaleDateString()}</p>
    </div>
</body>
</html>`;
  }

  /**
   * Schedule daily briefing generation
   */
  scheduleDailyBriefing(cronExpression: string = '0 8 * * *'): void {
    // This would integrate with a cron scheduler
    // For now, it's a placeholder
    console.log(`[DailyBriefing] Daily briefing scheduled for: ${cronExpression}`);
  }
}