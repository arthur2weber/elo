import Database from 'better-sqlite3';
import path from 'path';

export interface DeviceMetric {
  id?: number;
  device_id: string;
  metric_name: string;
  value: number;
  unit?: string;
  timestamp: Date;
  metadata?: Record<string, any>;
}

export interface MetricBaseline {
  device_id: string;
  metric_name: string;
  baseline_value: number;
  standard_deviation: number;
  sample_count: number;
  last_updated: Date;
  window_days: number;
}

export interface MetricTrend {
  device_id: string;
  metric_name: string;
  slope: number; // Rate of change per day
  intercept: number;
  r_squared: number; // Goodness of fit (0-1)
  sample_count: number;
  start_date: Date;
  end_date: Date;
  trend_type: 'increasing' | 'decreasing' | 'stable';
}

export interface RetentionPolicy {
  metric_name: string;
  retention_days: number;
}

export class MetricsStore {
  private db: Database.Database;
  private readonly DEFAULT_RETENTION_DAYS = 90; // 3 months
  private retentionPolicies: Map<string, number> = new Map();

  constructor(db: Database.Database) {
    this.db = db;
    this.initializeRetentionPolicies();
  }

  /**
   * Initialize default retention policies for different metric types
   */
  private initializeRetentionPolicies(): void {
    // Default policies - can be configured per metric type
    this.retentionPolicies.set('temperature', 365); // 1 year for temperature
    this.retentionPolicies.set('humidity', 365);
    this.retentionPolicies.set('power_consumption', 180); // 6 months
    this.retentionPolicies.set('response_time', 90); // 3 months
    this.retentionPolicies.set('uptime', 180);
    this.retentionPolicies.set('error_count', 90);
    this.retentionPolicies.set('performance_score', 180);
  }

  /**
   * Store a device metric
   */
  async storeMetric(metric: DeviceMetric): Promise<void> {
    const stmt = this.db.prepare(`
      INSERT INTO device_metrics (device_id, metric_name, value, unit, timestamp)
      VALUES (?, ?, ?, ?, ?)
    `);

    stmt.run(
      metric.device_id,
      metric.metric_name,
      metric.value,
      metric.unit || null,
      metric.timestamp.toISOString()
    );
  }

  /**
   * Store multiple metrics in batch
   */
  async storeMetricsBatch(metrics: DeviceMetric[]): Promise<void> {
    const stmt = this.db.prepare(`
      INSERT INTO device_metrics (device_id, metric_name, value, unit, timestamp)
      VALUES (?, ?, ?, ?, ?)
    `);

    const transaction = this.db.transaction((metrics: DeviceMetric[]) => {
      for (const metric of metrics) {
        stmt.run(
          metric.device_id,
          metric.metric_name,
          metric.value,
          metric.unit || null,
          metric.timestamp.toISOString()
        );
      }
    });

    transaction(metrics);
  }

  /**
   * Get metrics for a device and metric name within a time range
   */
  async getMetrics(
    deviceId: string,
    metricName: string,
    startDate: Date,
    endDate: Date,
    limit?: number
  ): Promise<DeviceMetric[]> {
    let query = `
      SELECT * FROM device_metrics
      WHERE device_id = ? AND metric_name = ?
      AND timestamp >= ? AND timestamp <= ?
      ORDER BY timestamp DESC
    `;

    const params: any[] = [
      deviceId,
      metricName,
      startDate.toISOString(),
      endDate.toISOString()
    ];

    if (limit) {
      query += ' LIMIT ?';
      params.push(limit);
    }

    const stmt = this.db.prepare(query);
    const rows = stmt.all(...params) as any[];

    return rows.map(row => ({
      id: row.id,
      device_id: row.device_id,
      metric_name: row.metric_name,
      value: row.value,
      unit: row.unit,
      timestamp: new Date(row.timestamp)
    }));
  }

  /**
   * Get latest metric value for a device and metric
   */
  async getLatestMetric(deviceId: string, metricName: string): Promise<DeviceMetric | null> {
    const stmt = this.db.prepare(`
      SELECT * FROM device_metrics
      WHERE device_id = ? AND metric_name = ?
      ORDER BY timestamp DESC
      LIMIT 1
    `);

    const row = stmt.get(deviceId, metricName) as any;
    if (!row) return null;

    return {
      id: row.id,
      device_id: row.device_id,
      metric_name: row.metric_name,
      value: row.value,
      unit: row.unit,
      timestamp: new Date(row.timestamp)
    };
  }

  /**
   * Get all metrics for a device within a time range
   */
  async getDeviceMetrics(
    deviceId: string,
    startDate: Date,
    endDate: Date
  ): Promise<DeviceMetric[]> {
    const stmt = this.db.prepare(`
      SELECT * FROM device_metrics
      WHERE device_id = ?
      AND timestamp >= ? AND timestamp <= ?
      ORDER BY timestamp DESC
    `);

    const rows = stmt.all(
      deviceId,
      startDate.toISOString(),
      endDate.toISOString()
    ) as any[];

    return rows.map(row => ({
      id: row.id,
      device_id: row.device_id,
      metric_name: row.metric_name,
      value: row.value,
      unit: row.unit,
      timestamp: new Date(row.timestamp)
    }));
  }

  /**
   * Calculate baseline statistics for a metric
   */
  async calculateBaseline(
    deviceId: string,
    metricName: string,
    windowDays: number = 30
  ): Promise<MetricBaseline | null> {
    const endDate = new Date();
    const startDate = new Date(endDate.getTime() - (windowDays * 24 * 60 * 60 * 1000));

    const metrics = await this.getMetrics(deviceId, metricName, startDate, endDate);

    if (metrics.length < 7) { // Need at least a week of data
      return null;
    }

    const values = metrics.map(m => m.value);
    const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
    const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
    const standardDeviation = Math.sqrt(variance);

    return {
      device_id: deviceId,
      metric_name: metricName,
      baseline_value: mean,
      standard_deviation: standardDeviation,
      sample_count: values.length,
      last_updated: new Date(),
      window_days: windowDays
    };
  }

  /**
   * Calculate trend using linear regression
   */
  async calculateTrend(
    deviceId: string,
    metricName: string,
    windowDays: number = 30
  ): Promise<MetricTrend | null> {
    const endDate = new Date();
    const startDate = new Date(endDate.getTime() - (windowDays * 24 * 60 * 60 * 1000));

    const metrics = await this.getMetrics(deviceId, metricName, startDate, endDate);

    if (metrics.length < 7) { // Need at least a week of data
      return null;
    }

    // Sort by timestamp (oldest first for regression)
    metrics.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

    const n = metrics.length;
    const xValues = metrics.map((_, i) => i); // Days as 0, 1, 2, ...
    const yValues = metrics.map(m => m.value);

    // Calculate linear regression
    const sumX = xValues.reduce((sum, x) => sum + x, 0);
    const sumY = yValues.reduce((sum, y) => sum + y, 0);
    const sumXY = xValues.reduce((sum, x, i) => sum + x * yValues[i], 0);
    const sumXX = xValues.reduce((sum, x) => sum + x * x, 0);
    const sumYY = yValues.reduce((sum, y) => sum + y * y, 0);

    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;

    // Calculate R-squared
    const yMean = sumY / n;
    const ssRes = yValues.reduce((sum, y, i) => {
      const predicted = slope * xValues[i] + intercept;
      return sum + Math.pow(y - predicted, 2);
    }, 0);
    const ssTot = yValues.reduce((sum, y) => sum + Math.pow(y - yMean, 2), 0);
    const rSquared = 1 - (ssRes / ssTot);

    // Determine trend type
    let trendType: 'increasing' | 'decreasing' | 'stable';
    if (Math.abs(slope) < 0.01) {
      trendType = 'stable';
    } else if (slope > 0) {
      trendType = 'increasing';
    } else {
      trendType = 'decreasing';
    }

    return {
      device_id: deviceId,
      metric_name: metricName,
      slope,
      intercept,
      r_squared: rSquared,
      sample_count: n,
      start_date: startDate,
      end_date: endDate,
      trend_type: trendType
    };
  }

  /**
   * Detect anomalies based on baseline
   */
  async detectAnomalies(
    deviceId: string,
    metricName: string,
    threshold: number = 3.0 // Standard deviations
  ): Promise<DeviceMetric[]> {
    const baseline = await this.calculateBaseline(deviceId, metricName);

    if (!baseline) {
      return [];
    }

    const endDate = new Date();
    const startDate = new Date(endDate.getTime() - (24 * 60 * 60 * 1000)); // Last 24 hours

    const recentMetrics = await this.getMetrics(deviceId, metricName, startDate, endDate);

    const anomalies: DeviceMetric[] = [];

    for (const metric of recentMetrics) {
      const zScore = Math.abs(metric.value - baseline.baseline_value) / baseline.standard_deviation;
      if (zScore > threshold) {
        anomalies.push(metric);
      }
    }

    return anomalies;
  }

  /**
   * Clean up old metrics based on retention policies
   */
  async cleanupOldMetrics(): Promise<number> {
    let totalDeleted = 0;

    for (const [metricName, retentionDays] of this.retentionPolicies) {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

      const stmt = this.db.prepare(`
        DELETE FROM device_metrics
        WHERE metric_name = ? AND timestamp < ?
      `);

      const result = stmt.run(metricName, cutoffDate.toISOString());
      totalDeleted += result.changes;
    }

    // Also clean up metrics not in retention policy with default retention
    const defaultCutoff = new Date();
    defaultCutoff.setDate(defaultCutoff.getDate() - this.DEFAULT_RETENTION_DAYS);

    const defaultStmt = this.db.prepare(`
      DELETE FROM device_metrics
      WHERE metric_name NOT IN (${Array.from(this.retentionPolicies.keys()).map(() => '?').join(',')})
      AND timestamp < ?
    `);

    const defaultResult = defaultStmt.run(
      ...Array.from(this.retentionPolicies.keys()),
      defaultCutoff.toISOString()
    );

    totalDeleted += defaultResult.changes;

    console.log(`[MetricsStore] Cleaned up ${totalDeleted} old metrics`);
    return totalDeleted;
  }

  /**
   * Get metric statistics for a device
   */
  async getMetricStats(
    deviceId: string,
    metricName: string,
    windowDays: number = 30
  ): Promise<{
    count: number;
    min: number;
    max: number;
    avg: number;
    median: number;
    latest: number;
    trend: MetricTrend | null;
    baseline: MetricBaseline | null;
  } | null> {
    const endDate = new Date();
    const startDate = new Date(endDate.getTime() - (windowDays * 24 * 60 * 60 * 1000));

    const metrics = await this.getMetrics(deviceId, metricName, startDate, endDate);

    if (metrics.length === 0) {
      return null;
    }

    const values = metrics.map(m => m.value).sort((a, b) => a - b);
    const sum = values.reduce((a, b) => a + b, 0);

    const stats = {
      count: values.length,
      min: Math.min(...values),
      max: Math.max(...values),
      avg: sum / values.length,
      median: values.length % 2 === 0
        ? (values[values.length / 2 - 1] + values[values.length / 2]) / 2
        : values[Math.floor(values.length / 2)],
      latest: metrics[0].value, // Already sorted by timestamp DESC
      trend: await this.calculateTrend(deviceId, metricName, windowDays),
      baseline: await this.calculateBaseline(deviceId, metricName, windowDays)
    };

    return stats;
  }

  /**
   * Set retention policy for a metric type
   */
  setRetentionPolicy(metricName: string, retentionDays: number): void {
    this.retentionPolicies.set(metricName, retentionDays);
  }

  /**
   * Get all available metrics for a device
   */
  async getAvailableMetrics(deviceId: string): Promise<string[]> {
    const stmt = this.db.prepare(`
      SELECT DISTINCT metric_name
      FROM device_metrics
      WHERE device_id = ?
      ORDER BY metric_name
    `);

    const rows = stmt.all(deviceId) as any[];
    return rows.map(row => row.metric_name);
  }
}