import { MetricsStore, MetricBaseline, DeviceMetric } from './metrics-store';
import Database from 'better-sqlite3';

export interface AnomalyDetection {
  metric: DeviceMetric;
  zScore: number;
  deviation: number;
  baseline: MetricBaseline;
  severity: 'low' | 'medium' | 'high' | 'critical';
}

export interface BaselineAlert {
  device_id: string;
  metric_name: string;
  alert_type: 'anomaly_detected' | 'trend_shift' | 'baseline_unstable';
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  details: Record<string, any>;
  timestamp: Date;
}

export class BaselineCalculator {
  private metricsStore: MetricsStore;
  private db: Database.Database;
  private readonly BASELINE_CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours

  constructor(metricsStore: MetricsStore, db: Database.Database) {
    this.metricsStore = metricsStore;
    this.db = db;
  }

  /**
   * Calculate and cache baseline for a metric
   */
  async getOrCalculateBaseline(
    deviceId: string,
    metricName: string,
    windowDays: number = 30
  ): Promise<MetricBaseline | null> {
    // Check if we have a recent cached baseline
    const cached = await this.getCachedBaseline(deviceId, metricName, windowDays);
    if (cached) {
      return cached;
    }

    // Calculate new baseline
    const baseline = await this.metricsStore.calculateBaseline(deviceId, metricName, windowDays);
    if (baseline) {
      await this.cacheBaseline(baseline);
    }

    return baseline;
  }

  /**
   * Detect anomalies in recent metrics
   */
  async detectAnomalies(
    deviceId: string,
    metricName: string,
    hoursBack: number = 24,
    threshold: number = 3.0
  ): Promise<AnomalyDetection[]> {
    const baseline = await this.getOrCalculateBaseline(deviceId, metricName);

    if (!baseline) {
      return [];
    }

    const endDate = new Date();
    const startDate = new Date(endDate.getTime() - (hoursBack * 60 * 60 * 1000));

    const recentMetrics = await this.metricsStore.getMetrics(
      deviceId,
      metricName,
      startDate,
      endDate
    );

    const anomalies: AnomalyDetection[] = [];

    for (const metric of recentMetrics) {
      const deviation = metric.value - baseline.baseline_value;
      const zScore = Math.abs(deviation) / baseline.standard_deviation;

      if (zScore > threshold) {
        const severity = this.calculateSeverity(zScore, threshold);

        anomalies.push({
          metric,
          zScore,
          deviation,
          baseline,
          severity
        });
      }
    }

    return anomalies;
  }

  /**
   * Calculate anomaly severity based on z-score
   */
  private calculateSeverity(zScore: number, threshold: number): 'low' | 'medium' | 'high' | 'critical' {
    const severityLevel = zScore / threshold;

    if (severityLevel >= 4) return 'critical';
    if (severityLevel >= 3) return 'high';
    if (severityLevel >= 2) return 'medium';
    return 'low';
  }

  /**
   * Perform comprehensive anomaly check across all device metrics
   */
  async checkAllDevicesForAnomalies(): Promise<BaselineAlert[]> {
    const alerts: BaselineAlert[] = [];

    // Get all devices with metrics
    const devices = await this.getDevicesWithMetrics();

    for (const deviceId of devices) {
      const metricNames = await this.metricsStore.getAvailableMetrics(deviceId);

      for (const metricName of metricNames) {
        try {
          const anomalies = await this.detectAnomalies(deviceId, metricName, 24, 2.5);

          for (const anomaly of anomalies) {
            const alert = await this.createAnomalyAlert(anomaly);
            alerts.push(alert);
          }

          // Also check for baseline instability
          const baselineInstability = await this.detectBaselineInstability(deviceId, metricName);
          if (baselineInstability) {
            alerts.push(baselineInstability);
          }

        } catch (error) {
          console.error(`[BaselineCalculator] Error checking anomalies for ${deviceId}:${metricName}:`, error);
        }
      }
    }

    return alerts;
  }

  /**
   * Detect if baseline is becoming unstable (high variance)
   */
  private async detectBaselineInstability(
    deviceId: string,
    metricName: string
  ): Promise<BaselineAlert | null> {
    const baseline = await this.getOrCalculateBaseline(deviceId, metricName, 7); // Last week

    if (!baseline || baseline.sample_count < 10) {
      return null;
    }

    // High coefficient of variation indicates instability
    const coefficientOfVariation = baseline.standard_deviation / Math.abs(baseline.baseline_value);

    if (coefficientOfVariation > 0.5) { // More than 50% variation
      return {
        device_id: deviceId,
        metric_name: metricName,
        alert_type: 'baseline_unstable',
        severity: 'medium',
        message: `Unstable baseline detected for ${metricName} on ${deviceId}`,
        details: {
          coefficient_of_variation: coefficientOfVariation,
          baseline_value: baseline.baseline_value,
          standard_deviation: baseline.standard_deviation,
          sample_count: baseline.sample_count
        },
        timestamp: new Date()
      };
    }

    return null;
  }

  /**
   * Create alert from anomaly detection
   */
  private async createAnomalyAlert(anomaly: AnomalyDetection): Promise<BaselineAlert> {
    const { metric, zScore, deviation, baseline, severity } = anomaly;

    let message = '';
    if (deviation > 0) {
      message = `${metric.metric_name} is ${Math.abs(deviation).toFixed(2)} ${metric.unit || 'units'} above normal on ${metric.device_id}`;
    } else {
      message = `${metric.metric_name} is ${Math.abs(deviation).toFixed(2)} ${metric.unit || 'units'} below normal on ${metric.device_id}`;
    }

    return {
      device_id: metric.device_id,
      metric_name: metric.metric_name,
      alert_type: 'anomaly_detected',
      severity,
      message,
      details: {
        current_value: metric.value,
        baseline_value: baseline.baseline_value,
        deviation,
        z_score: zScore,
        standard_deviation: baseline.standard_deviation,
        timestamp: metric.timestamp
      },
      timestamp: new Date()
    };
  }

  /**
   * Get statistical summary for anomaly analysis
   */
  async getAnomalySummary(deviceId: string, metricName: string): Promise<{
    totalAnomalies: number;
    anomaliesBySeverity: Record<string, number>;
    recentAnomalies: AnomalyDetection[];
    baselineStability: 'stable' | 'unstable' | 'insufficient_data';
  }> {
    const anomalies = await this.detectAnomalies(deviceId, metricName, 168, 2.0); // Last 7 days

    const anomaliesBySeverity = anomalies.reduce((acc, anomaly) => {
      acc[anomaly.severity] = (acc[anomaly.severity] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    // Determine baseline stability
    const baseline = await this.getOrCalculateBaseline(deviceId, metricName, 30);
    let baselineStability: 'stable' | 'unstable' | 'insufficient_data' = 'insufficient_data';

    if (baseline && baseline.sample_count >= 14) {
      const coefficientOfVariation = baseline.standard_deviation / Math.abs(baseline.baseline_value);
      baselineStability = coefficientOfVariation > 0.3 ? 'unstable' : 'stable';
    }

    return {
      totalAnomalies: anomalies.length,
      anomaliesBySeverity,
      recentAnomalies: anomalies.slice(0, 10), // Last 10 anomalies
      baselineStability
    };
  }

  /**
   * Predict expected value for a metric at a future time
   */
  async predictValue(
    deviceId: string,
    metricName: string,
    hoursAhead: number = 24
  ): Promise<{
    predicted_value: number;
    confidence_interval: [number, number];
    based_on_samples: number;
  } | null> {
    const baseline = await this.getOrCalculateBaseline(deviceId, metricName);

    if (!baseline) {
      return null;
    }

    // For now, use baseline as prediction (no trend analysis yet)
    // This will be enhanced when we integrate with TrendAnalyzer
    const predictedValue = baseline.baseline_value;
    const marginOfError = baseline.standard_deviation * 1.96; // 95% confidence interval

    return {
      predicted_value: predictedValue,
      confidence_interval: [
        predictedValue - marginOfError,
        predictedValue + marginOfError
      ],
      based_on_samples: baseline.sample_count
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
   * Cache baseline calculation
   */
  private async cacheBaseline(baseline: MetricBaseline): Promise<void> {
    // For now, we'll recalculate baselines on demand
    // In a production system, you might want to cache these in a separate table
    // or use Redis/memory cache for better performance
  }

  /**
   * Get cached baseline if recent
   */
  private async getCachedBaseline(
    deviceId: string,
    metricName: string,
    windowDays: number
  ): Promise<MetricBaseline | null> {
    // For now, always recalculate. In production, check cache timestamp
    return null;
  }

  /**
   * Clean up old cached baselines
   */
  async cleanupCache(): Promise<void> {
    // Placeholder for cache cleanup logic
    // In a real implementation with caching, this would remove expired entries
  }

  /**
   * Get baseline health score (0-100) for monitoring
   */
  async getBaselineHealthScore(deviceId: string, metricName: string): Promise<number> {
    const baseline = await this.getOrCalculateBaseline(deviceId, metricName);

    if (!baseline) {
      return 0; // No data
    }

    if (baseline.sample_count < 7) {
      return 20; // Insufficient data
    }

    // Score based on sample count and stability
    const sampleScore = Math.min(50, (baseline.sample_count / 30) * 50); // Up to 50 points for sample count

    const coefficientOfVariation = baseline.standard_deviation / Math.abs(baseline.baseline_value);
    const stabilityScore = Math.max(0, 50 - (coefficientOfVariation * 200)); // Up to 50 points for stability

    return Math.round(sampleScore + stabilityScore);
  }
}