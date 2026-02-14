import { MetricsStore, MetricTrend, DeviceMetric } from './metrics-store';
import { runGeminiApiPrompt } from '../ai/gemini-api';
import Database from 'better-sqlite3';

export interface TrendAnalysis {
  trend: MetricTrend;
  significance: 'weak' | 'moderate' | 'strong' | 'very_strong';
  confidence: number; // 0-100
  interpretation: string;
  recommendations: string[];
  severity: 'low' | 'medium' | 'high' | 'critical';
}

export interface DegradationAlert {
  device_id: string;
  metric_name: string;
  alert_type: 'performance_decline' | 'efficiency_drop' | 'wear_indicators';
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  trend_analysis: TrendAnalysis;
  estimated_time_to_issue?: number; // days until potential problem
  recommendations: string[];
  timestamp: Date;
}

export class TrendAnalyzer {
  private metricsStore: MetricsStore;
  private db: Database.Database;

  constructor(metricsStore: MetricsStore, db: Database.Database) {
    this.metricsStore = metricsStore;
    this.db = db;
  }

  /**
   * Analyze trend for a specific metric
   */
  async analyzeTrend(
    deviceId: string,
    metricName: string,
    windowDays: number = 30
  ): Promise<TrendAnalysis | null> {
    const trend = await this.metricsStore.calculateTrend(deviceId, metricName, windowDays);

    if (!trend) {
      return null;
    }

    const significance = this.calculateSignificance(trend);
    const confidence = Math.round(trend.r_squared * 100);
    const interpretation = await this.interpretTrend(trend, deviceId, metricName);
    const recommendations = await this.generateRecommendations(trend, deviceId, metricName);
    const severity = this.assessSeverity(trend, significance);

    return {
      trend,
      significance,
      confidence,
      interpretation,
      recommendations,
      severity
    };
  }

  /**
   * Calculate statistical significance of the trend
   */
  private calculateSignificance(trend: MetricTrend): 'weak' | 'moderate' | 'strong' | 'very_strong' {
    const rSquared = trend.r_squared;
    const sampleSize = trend.sample_count;
    const slope = Math.abs(trend.slope);

    // Adjust significance based on sample size and R-squared
    let significanceScore = rSquared;

    // Penalize small sample sizes
    if (sampleSize < 14) significanceScore *= 0.7;
    else if (sampleSize < 30) significanceScore *= 0.9;

    // Boost significance for strong slopes
    if (slope > 0.1) significanceScore *= 1.2;

    if (significanceScore >= 0.8) return 'very_strong';
    if (significanceScore >= 0.6) return 'strong';
    if (significanceScore >= 0.4) return 'moderate';
    return 'weak';
  }

  /**
   * Assess severity of the trend
   */
  private assessSeverity(trend: MetricTrend, significance: string): 'low' | 'medium' | 'high' | 'critical' {
    const slope = Math.abs(trend.slope);

    // Critical for very strong negative trends with significant slope
    if (significance === 'very_strong' && trend.trend_type === 'decreasing' && slope > 0.2) {
      return 'critical';
    }

    // High for strong negative trends
    if (significance === 'strong' && trend.trend_type === 'decreasing') {
      return 'high';
    }

    // Medium for moderate negative trends or strong positive trends (could indicate problems)
    if ((significance === 'moderate' && trend.trend_type === 'decreasing') ||
        (significance === 'strong' && trend.trend_type === 'increasing' && slope > 0.15)) {
      return 'medium';
    }

    return 'low';
  }

  /**
   * Use Gemini to interpret the trend
   */
  private async interpretTrend(trend: MetricTrend, deviceId: string, metricName: string): Promise<string> {
    const prompt = `Analyze this metric trend and provide a brief interpretation:

METRIC: ${metricName} on device ${deviceId}
TREND TYPE: ${trend.trend_type}
SLOPE: ${trend.slope.toFixed(4)} per day
R-SQUARED: ${(trend.r_squared * 100).toFixed(1)}%
SAMPLE SIZE: ${trend.sample_count} data points
TIME PERIOD: ${trend.start_date.toISOString().split('T')[0]} to ${trend.end_date.toISOString().split('T')[0]}

Provide a 1-2 sentence interpretation of what this trend means for the device performance.`;

    try {
      const response = await runGeminiApiPrompt(prompt);
      return response.trim();
    } catch (error) {
      console.error('[TrendAnalyzer] Error interpreting trend:', error);
      return `The ${metricName} shows a ${trend.trend_type} trend with slope ${trend.slope.toFixed(4)} per day.`;
    }
  }

  /**
   * Generate maintenance recommendations based on trend
   */
  private async generateRecommendations(trend: MetricTrend, deviceId: string, metricName: string): Promise<string[]> {
    const recommendations: string[] = [];

    // Basic recommendations based on trend type and metric
    if (trend.trend_type === 'decreasing') {
      switch (metricName.toLowerCase()) {
        case 'temperature':
          if (trend.slope < -0.1) {
            recommendations.push('Check cooling system efficiency');
            recommendations.push('Clean air filters and vents');
          }
          break;

        case 'power_consumption':
        case 'power':
          recommendations.push('Monitor for unusual power draw patterns');
          recommendations.push('Check for electrical issues or component wear');
          break;

        case 'response_time':
        case 'latency':
          recommendations.push('Consider performance optimization or hardware upgrade');
          recommendations.push('Check for memory leaks or resource constraints');
          break;

        case 'efficiency':
        case 'performance_score':
          recommendations.push('Schedule maintenance to restore optimal performance');
          recommendations.push('Consider firmware update or calibration');
          break;

        default:
          recommendations.push('Monitor closely for potential performance issues');
          recommendations.push('Consider professional inspection if trend continues');
      }
    } else if (trend.trend_type === 'increasing') {
      switch (metricName.toLowerCase()) {
        case 'temperature':
          recommendations.push('Monitor cooling system capacity');
          recommendations.push('Ensure proper ventilation and airflow');
          break;

        case 'power_consumption':
          recommendations.push('Investigate increasing power requirements');
          recommendations.push('Check for component aging or additional load');
          break;

        default:
          recommendations.push('Monitor trend for potential issues');
      }
    }

    // Add time-based recommendations
    if (trend.r_squared > 0.7) {
      const daysToConcern = this.estimateDaysToConcern(trend);
      if (daysToConcern < 30) {
        recommendations.unshift(`Address within ${daysToConcern} days to prevent issues`);
      }
    }

    return recommendations;
  }

  /**
   * Estimate days until the trend becomes concerning
   */
  private estimateDaysToConcern(trend: MetricTrend): number {
    // This is a simplified estimation - in practice, you'd use domain-specific thresholds
    const slope = Math.abs(trend.slope);

    if (slope < 0.01) return 365; // Very slow change
    if (slope < 0.05) return 180; // Slow change
    if (slope < 0.1) return 90;   // Moderate change
    if (slope < 0.2) return 30;   // Fast change
    return 7; // Very fast change
  }

  /**
   * Analyze trends across all devices and generate alerts
   */
  async analyzeAllTrends(): Promise<DegradationAlert[]> {
    const alerts: DegradationAlert[] = [];

    // Get all devices with metrics
    const devices = await this.getDevicesWithMetrics();

    for (const deviceId of devices) {
      const metricNames = await this.metricsStore.getAvailableMetrics(deviceId);

      for (const metricName of metricNames) {
        try {
          const analysis = await this.analyzeTrend(deviceId, metricName, 30);

          if (analysis && analysis.severity !== 'low' && analysis.significance !== 'weak') {
            const alert = await this.createDegradationAlert(analysis);
            alerts.push(alert);
          }
        } catch (error) {
          console.error(`[TrendAnalyzer] Error analyzing trend for ${deviceId}:${metricName}:`, error);
        }
      }
    }

    return alerts;
  }

  /**
   * Create degradation alert from trend analysis
   */
  private async createDegradationAlert(analysis: TrendAnalysis): Promise<DegradationAlert> {
    const { trend, significance, severity, interpretation, recommendations } = analysis;

    let alertType: 'performance_decline' | 'efficiency_drop' | 'wear_indicators';
    let message = '';

    // Determine alert type based on metric and trend
    if (trend.metric_name.toLowerCase().includes('efficiency') ||
        trend.metric_name.toLowerCase().includes('performance')) {
      alertType = 'efficiency_drop';
      message = `Efficiency decline detected for ${trend.metric_name} on ${trend.device_id}`;
    } else if (trend.trend_type === 'decreasing' &&
               (trend.metric_name.toLowerCase().includes('response') ||
                trend.metric_name.toLowerCase().includes('latency'))) {
      alertType = 'performance_decline';
      message = `Performance decline detected for ${trend.metric_name} on ${trend.device_id}`;
    } else {
      alertType = 'wear_indicators';
      message = `Wear indicators detected for ${trend.metric_name} on ${trend.device_id}`;
    }

    const estimatedTimeToIssue = this.estimateDaysToConcern(trend);

    return {
      device_id: trend.device_id,
      metric_name: trend.metric_name,
      alert_type: alertType,
      severity,
      message,
      trend_analysis: analysis,
      estimated_time_to_issue: estimatedTimeToIssue,
      recommendations,
      timestamp: new Date()
    };
  }

  /**
   * Get trend summary for dashboard
   */
  async getTrendSummary(deviceId: string, metricName: string): Promise<{
    current_trend: MetricTrend | null;
    analysis: TrendAnalysis | null;
    health_score: number; // 0-100
    status: 'healthy' | 'monitoring' | 'concerning' | 'critical';
  }> {
    const trend = await this.metricsStore.calculateTrend(deviceId, metricName, 30);
    const analysis = trend ? await this.analyzeTrend(deviceId, metricName, 30) : null;

    let healthScore = 100;
    let status: 'healthy' | 'monitoring' | 'concerning' | 'critical' = 'healthy';

    if (analysis) {
      // Calculate health score based on trend and significance
      const significanceMultiplier = {
        'weak': 1.0,
        'moderate': 0.8,
        'strong': 0.6,
        'very_strong': 0.4
      };

      const severityPenalty = {
        'low': 0,
        'medium': 20,
        'high': 40,
        'critical': 60
      };

      healthScore = Math.max(0, 100 -
        (severityPenalty[analysis.severity]) -
        ((1 - analysis.confidence / 100) * 20)
      );

      // Determine status
      if (analysis.severity === 'critical' || healthScore < 30) {
        status = 'critical';
      } else if (analysis.severity === 'high' || healthScore < 50) {
        status = 'concerning';
      } else if (analysis.severity === 'medium' || healthScore < 70) {
        status = 'monitoring';
      }
    }

    return {
      current_trend: trend,
      analysis,
      health_score: Math.round(healthScore),
      status
    };
  }

  /**
   * Predict future values based on trend
   */
  async predictFutureValue(
    deviceId: string,
    metricName: string,
    daysAhead: number = 30
  ): Promise<{
    predicted_value: number;
    confidence: number;
    based_on_trend: MetricTrend;
  } | null> {
    const trend = await this.metricsStore.calculateTrend(deviceId, metricName, 30);

    if (!trend) {
      return null;
    }

    // Get the most recent value
    const latestMetric = await this.metricsStore.getLatestMetric(deviceId, metricName);
    if (!latestMetric) {
      return null;
    }

    // Calculate days since trend start
    const daysSinceStart = (latestMetric.timestamp.getTime() - trend.start_date.getTime()) / (1000 * 60 * 60 * 24);

    // Predict future value using linear regression
    const predictedValue = trend.slope * (daysSinceStart + daysAhead) + trend.intercept;

    return {
      predicted_value: predictedValue,
      confidence: Math.round(trend.r_squared * 100),
      based_on_trend: trend
    };
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
   * Export trend data for external analysis
   */
  async exportTrendData(deviceId: string, metricName: string, windowDays: number = 90): Promise<{
    device_id: string;
    metric_name: string;
    data_points: Array<{timestamp: Date, value: number}>;
    trend: MetricTrend | null;
    analysis: TrendAnalysis | null;
  }> {
    const endDate = new Date();
    const startDate = new Date(endDate.getTime() - (windowDays * 24 * 60 * 60 * 1000));

    const metrics = await this.metricsStore.getMetrics(deviceId, metricName, startDate, endDate);
    const trend = await this.metricsStore.calculateTrend(deviceId, metricName, windowDays);
    const analysis = trend ? await this.analyzeTrend(deviceId, metricName, windowDays) : null;

    return {
      device_id: deviceId,
      metric_name: metricName,
      data_points: metrics.map(m => ({
        timestamp: m.timestamp,
        value: m.value
      })),
      trend,
      analysis
    };
  }
}