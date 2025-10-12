// Enhanced metrics collection for per-process monitoring
import client from 'prom-client';
import pidusage from 'pidusage';
import { exec } from 'child_process';
import { promisify } from 'util';
import { safeReadFile, safeExistsSync } from './safePath.js';

const execAsync = promisify(exec);

const register = new client.Registry();

// Enable default Node.js metrics
client.collectDefaultMetrics({
  register,
  prefix: 'tago_',
  gcDurationBuckets: [0.001, 0.01, 0.1, 1, 2, 5],
});

// HTTP metrics
const httpRequestDuration = new client.Histogram({
  name: 'tago_http_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status'],
  buckets: [0.1, 0.3, 0.5, 0.7, 1, 3, 5, 7, 10],
  registers: [register],
});

const httpRequestTotal = new client.Counter({
  name: 'tago_http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status'],
  registers: [register],
});

// Overall analysis process metrics
const analysisProcesses = new client.Gauge({
  name: 'tago_analysis_processes',
  help: 'Number of analysis processes',
  labelNames: ['state', 'type'],
  registers: [register],
});

// Per-process metrics with analysis_name label
const analysisProcessStatus = new client.Gauge({
  name: 'tago_analysis_process_status',
  help: 'Process status (1 = running, 0 = stopped)',
  labelNames: ['analysis_name', 'type'],
  registers: [register],
});

const analysisProcessCPU = new client.Gauge({
  name: 'tago_analysis_cpu_percent',
  help: 'CPU usage percentage of analysis processes',
  labelNames: ['analysis_name'],
  registers: [register],
});

const analysisProcessMemory = new client.Gauge({
  name: 'tago_analysis_memory_bytes',
  help: 'Memory usage of analysis processes in bytes',
  labelNames: ['analysis_name'],
  registers: [register],
});

const analysisProcessUptime = new client.Gauge({
  name: 'tago_analysis_uptime_seconds',
  help: 'Process uptime in seconds',
  labelNames: ['analysis_name'],
  registers: [register],
});

const analysisRestarts = new client.Counter({
  name: 'tago_analysis_restarts_total',
  help: 'Total analysis process restarts',
  labelNames: ['analysis_name', 'reason'],
  registers: [register],
});

const analysisErrors = new client.Counter({
  name: 'tago_analysis_errors_total',
  help: 'Total errors from analysis processes',
  labelNames: ['analysis_name', 'type'],
  registers: [register],
});

const analysisLogLines = new client.Counter({
  name: 'tago_analysis_log_lines_total',
  help: 'Total log lines output by analysis',
  labelNames: ['analysis_name'],
  registers: [register],
});

const analysisIPCMessages = new client.Counter({
  name: 'tago_analysis_ipc_messages_total',
  help: 'Total IPC messages between parent and child',
  labelNames: ['analysis_name', 'direction'],
  registers: [register],
});

// Per-process DNS cache metrics
const analysisDNSCacheHits = new client.Counter({
  name: 'tago_analysis_dns_cache_hits',
  help: 'DNS cache hits per analysis',
  labelNames: ['analysis_name'],
  registers: [register],
});

const analysisDNSCacheMisses = new client.Counter({
  name: 'tago_analysis_dns_cache_misses',
  help: 'DNS cache misses per analysis',
  labelNames: ['analysis_name'],
  registers: [register],
});

// Per-process network I/O metrics
const analysisNetworkBytes = new client.Gauge({
  name: 'tago_analysis_network_bytes',
  help: 'Network I/O bytes for analysis processes',
  labelNames: ['analysis_name', 'direction'],
  registers: [register],
});

const analysisOpenConnections = new client.Gauge({
  name: 'tago_analysis_open_connections',
  help: 'Number of open network connections',
  labelNames: ['analysis_name', 'state'],
  registers: [register],
});

// SSE metrics
const sseConnections = new client.Gauge({
  name: 'tago_sse_connections',
  help: 'Number of active SSE connections',
  registers: [register],
});

// Global DNS Cache metrics
const dnsCacheHits = new client.Counter({
  name: 'tago_dns_cache_hits_total',
  help: 'Global DNS cache hit count',
  registers: [register],
});

const dnsCacheMisses = new client.Counter({
  name: 'tago_dns_cache_misses_total',
  help: 'Global DNS cache miss count',
  registers: [register],
});

// Process start times tracking (for uptime calculation)
const processStartTimes = new Map();

export {
  register,
  httpRequestDuration,
  httpRequestTotal,
  analysisProcesses,
  analysisProcessStatus,
  analysisProcessCPU,
  analysisProcessMemory,
  analysisProcessUptime,
  analysisRestarts,
  analysisErrors,
  analysisLogLines,
  analysisIPCMessages,
  analysisDNSCacheHits,
  analysisDNSCacheMisses,
  analysisNetworkBytes,
  analysisOpenConnections,
  sseConnections,
  dnsCacheHits,
  dnsCacheMisses,
  processStartTimes,
};

// Middleware for Express
export function metricsMiddleware(req, res, next) {
  const start = Date.now();

  res.on('finish', () => {
    const duration = (Date.now() - start) / 1000;
    const route = req.route?.path || req.path || 'unknown';
    const labels = {
      method: req.method,
      route: route,
      status: res.statusCode,
    };

    httpRequestDuration.observe(labels, duration);
    httpRequestTotal.inc(labels);
  });

  next();
}

// Network stats collection helpers

/**
 * Get network I/O stats for a process (Linux only via /proc filesystem)
 * Returns bytes received and transmitted if available
 */
async function getProcessNetworkStats(pid) {
  // Linux-specific: try to get network stats from /proc
  if (process.platform === 'linux') {
    try {
      // Read network device stats - note this is system-wide, not per-process
      // Per-process network I/O requires parsing /proc/net/tcp and matching file descriptors
      const netDevPath = `/proc/${pid}/net/dev`;

      if (!safeExistsSync(netDevPath)) {
        return null;
      }

      const content = await safeReadFile(netDevPath, 'utf8');
      const lines = content.split('\n');

      let rxBytes = 0;
      let txBytes = 0;

      // Parse network device stats (format: interface | rxBytes ... | txBytes ...)
      for (const line of lines) {
        // Skip header lines
        if (line.includes('Receive') || line.includes('face')) continue;

        const parts = line.trim().split(/\s+/);
        if (parts.length < 10) continue;

        // Interface is parts[0], rx bytes is parts[1], tx bytes is parts[9]
        const interfaceName = parts[0].replace(':', '');

        // Skip loopback interface
        if (interfaceName === 'lo') continue;

        rxBytes += parseInt(parts[1]) || 0;
        txBytes += parseInt(parts[9]) || 0;
      }

      return { rxBytes, txBytes };
    } catch {
      // /proc access failed, return null
      return null;
    }
  }

  return null;
}

/**
 * Get count of open network connections for a process
 * Returns connection counts by state (established, listen, etc.)
 */
async function getProcessConnections(pid) {
  if (process.platform === 'linux') {
    try {
      // Use lsof to get network connections for the process
      const { stdout } = await execAsync(
        `lsof -p ${pid} -n -P 2>/dev/null | grep -E 'TCP|UDP' || true`,
      );

      const connections = {
        established: 0,
        listen: 0,
        other: 0,
        total: 0,
      };

      if (!stdout.trim()) {
        return connections;
      }

      const lines = stdout.trim().split('\n');

      for (const line of lines) {
        connections.total++;

        if (line.includes('ESTABLISHED')) {
          connections.established++;
        } else if (line.includes('LISTEN')) {
          connections.listen++;
        } else {
          connections.other++;
        }
      }

      return connections;
    } catch {
      // lsof not available or permission denied
      return null;
    }
  }

  return null;
}

// Collect detailed child process metrics
export async function collectChildProcessMetrics(processes) {
  let runningCount = 0;
  let stoppedCount = 0;
  let listenerCount = 0;
  let actionCount = 0;

  for (const [name, process] of processes) {
    const isRunning = process.status === 'running';
    const processType = process.type;

    // Update process status
    analysisProcessStatus.set(
      { analysis_name: name, type: processType },
      isRunning ? 1 : 0,
    );

    // Count overall processes
    if (isRunning) {
      runningCount++;
      if (processType === 'listener') listenerCount++;
      else if (processType === 'action') actionCount++;
    } else {
      stoppedCount++;
    }

    // Collect resource metrics for running processes
    if (isRunning && process.process?.pid) {
      try {
        const stats = await pidusage(process.process.pid);

        // CPU and Memory metrics
        analysisProcessCPU.set({ analysis_name: name }, stats.cpu);
        analysisProcessMemory.set({ analysis_name: name }, stats.memory);

        // Track process start time for uptime calculation
        if (!processStartTimes.has(name)) {
          processStartTimes.set(name, Date.now());
        }

        // Calculate and set uptime
        const startTime = processStartTimes.get(name);
        const uptime = (Date.now() - startTime) / 1000;
        analysisProcessUptime.set({ analysis_name: name }, uptime);

        // Collect network stats (Linux only)
        const networkStats = await getProcessNetworkStats(process.process.pid);
        if (networkStats) {
          analysisNetworkBytes.set(
            { analysis_name: name, direction: 'rx' },
            networkStats.rxBytes,
          );
          analysisNetworkBytes.set(
            { analysis_name: name, direction: 'tx' },
            networkStats.txBytes,
          );
        }

        // Collect connection stats (Linux only)
        const connections = await getProcessConnections(process.process.pid);
        if (connections) {
          analysisOpenConnections.set(
            { analysis_name: name, state: 'established' },
            connections.established,
          );
          analysisOpenConnections.set(
            { analysis_name: name, state: 'listen' },
            connections.listen,
          );
          analysisOpenConnections.set(
            { analysis_name: name, state: 'other' },
            connections.other,
          );
        }
      } catch {
        // Process may have exited, reset metrics
        analysisProcessCPU.set({ analysis_name: name }, 0);
        analysisProcessMemory.set({ analysis_name: name }, 0);
        analysisProcessUptime.set({ analysis_name: name }, 0);
        analysisNetworkBytes.set({ analysis_name: name, direction: 'rx' }, 0);
        analysisNetworkBytes.set({ analysis_name: name, direction: 'tx' }, 0);
        analysisOpenConnections.set(
          { analysis_name: name, state: 'established' },
          0,
        );
        analysisOpenConnections.set(
          { analysis_name: name, state: 'listen' },
          0,
        );
        analysisOpenConnections.set({ analysis_name: name, state: 'other' }, 0);
        processStartTimes.delete(name);
      }
    } else {
      // Process is stopped, reset metrics
      analysisProcessCPU.set({ analysis_name: name }, 0);
      analysisProcessMemory.set({ analysis_name: name }, 0);
      analysisProcessUptime.set({ analysis_name: name }, 0);
      analysisNetworkBytes.set({ analysis_name: name, direction: 'rx' }, 0);
      analysisNetworkBytes.set({ analysis_name: name, direction: 'tx' }, 0);
      analysisOpenConnections.set(
        { analysis_name: name, state: 'established' },
        0,
      );
      analysisOpenConnections.set({ analysis_name: name, state: 'listen' }, 0);
      analysisOpenConnections.set({ analysis_name: name, state: 'other' }, 0);
      processStartTimes.delete(name);
    }
  }

  // Update overall process counts
  analysisProcesses.set({ state: 'running', type: 'all' }, runningCount);
  analysisProcesses.set({ state: 'stopped', type: 'all' }, stoppedCount);
  analysisProcesses.set({ state: 'running', type: 'listener' }, listenerCount);
  analysisProcesses.set({ state: 'running', type: 'action' }, actionCount);
}

// Helper to track process events
export function trackProcessRestart(analysisName, reason = 'unknown') {
  analysisRestarts.inc({ analysis_name: analysisName, reason });
  // Reset start time on restart
  processStartTimes.set(analysisName, Date.now());
}

export function trackProcessError(analysisName, errorType = 'runtime') {
  analysisErrors.inc({ analysis_name: analysisName, type: errorType });
}

export function trackLogLine(analysisName) {
  analysisLogLines.inc({ analysis_name: analysisName });
}

export function trackIPCMessage(analysisName, direction = 'inbound') {
  analysisIPCMessages.inc({ analysis_name: analysisName, direction });
}

export function trackDNSCache(analysisName, hit = true) {
  if (hit) {
    analysisDNSCacheHits.inc({ analysis_name: analysisName });
    dnsCacheHits.inc();
  } else {
    analysisDNSCacheMisses.inc({ analysis_name: analysisName });
    dnsCacheMisses.inc();
  }
}
