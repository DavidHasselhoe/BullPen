/**
 * Table Detection Logger
 * Batches table rejection logs to avoid spam
 */

export interface TableDetectionStats {
  total: number;
  valid: number;
  rejected: number;
  rejectionReasons: Map<string, number>;
}

export class TableDetectionLogger {
  private stats: TableDetectionStats;
  private onProgress?: (message: string, details?: any) => void;

  constructor(onProgress?: (message: string, details?: any) => void) {
    this.stats = {
      total: 0,
      valid: 0,
      rejected: 0,
      rejectionReasons: new Map(),
    };
    this.onProgress = onProgress;
  }

  /**
   * Record a table detection
   */
  recordTable(isValid: boolean, rejectionReason?: string) {
    this.stats.total++;
    
    if (isValid) {
      this.stats.valid++;
    } else {
      this.stats.rejected++;
      if (rejectionReason) {
        const count = this.stats.rejectionReasons.get(rejectionReason) || 0;
        this.stats.rejectionReasons.set(rejectionReason, count + 1);
      }
    }
  }

  /**
   * Log summary of table detection
   */
  logSummary() {
    const { total, valid, rejected, rejectionReasons } = this.stats;
    
    if (total === 0) {
      this.onProgress?.('No tables found in filing');
      return;
    }

    // Log valid tables
    if (valid > 0) {
      this.onProgress?.('Tables found', {
        valid: `${valid}/${total}`,
        total,
      });
    }

    // Log rejected tables with counts
    if (rejected > 0) {
      const reasons: string[] = [];
      rejectionReasons.forEach((count, reason) => {
        reasons.push(`${reason} (${count})`);
      });
      
      this.onProgress?.('Tables rejected', {
        count: `${rejected}/${total}`,
        reasons: reasons.join('; '),
      });
    }
  }

  /**
   * Get current stats
   */
  getStats(): TableDetectionStats {
    return { ...this.stats };
  }

  /**
   * Reset stats
   */
  reset() {
    this.stats = {
      total: 0,
      valid: 0,
      rejected: 0,
      rejectionReasons: new Map(),
    };
  }
}
