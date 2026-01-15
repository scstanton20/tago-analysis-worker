# SSE Channel Architecture Redesign

## Problem Statement

Current architecture sends ALL data through single channels:

- Subscribing to an analysis channel for the Info Modal pulls ALL log lines (wasteful)
- Global metrics broadcast sends heavy data to all clients every second
- No separation between lightweight status updates and heavy data streams

## New Channel Architecture

### 1. Global Channel (lighter - status only)

**Purpose:** Essential state for all connected clients

**Broadcasts:**

- `init` - initial state on connect
- `statusUpdate` - container health, uptime, running analysis count
- `analysisUpdate` - status changes (running/stopped)
- `analysisCreated`, `analysisDeleted`, `analysisRenamed`
- `analysisMovedToTeam`, `analysisRolledBack`
- `teamUpdate`, `teamCreated`, `teamDeleted`
- `logsCleared` - notify log viewers to reset
- `heartbeat` - keepalive

**Removed from global:**

- Full metrics data (moved to metrics channel)
- Per-analysis process details

---

### 2. Metrics Channel (new - on-demand)

**Purpose:** Detailed system metrics for Settings/Monitoring views

**Subscribe:** When Settings modal or Metrics Dashboard is open
**Unsubscribe:** When view is closed

**Broadcasts (every 1s when subscribed):**

- `metricsUpdate`:
  - `total` - aggregate system metrics
  - `container` - backend container metrics (CPU, memory, event loop)
  - `children` - child processes aggregate
  - `processes[]` - per-process details (analysis_id, cpu, memory, uptime)
  - `container_health` - health status
  - `tagoConnection` - SDK version, connection status

- `dnsConfigUpdated` - DNS cache configuration changes
- `dnsStatsUpdate` - Global DNS cache statistics

---

### 3. Analysis Stats Channel (new - per analysis)

**Key:** `stats:{analysisId}`

**Purpose:** Lightweight metadata for Info Modal, analysis cards

**Subscribe:** When Info Modal opens or analysis card needs live updates
**Unsubscribe:** When view closes

**On Subscription (immediate push):**

- `analysisLogStats` - current log count, file size
- `analysisDnsStats` - per-analysis DNS cache stats
- `analysisProcessMetrics` - CPU, memory, uptime (if running)

**Broadcasts (when analysis is running):**

- `analysisLogStats` - updated count/size after each log write
- `analysisProcessMetrics` - periodic metrics updates (every 1s)
- `analysisDnsStats` - DNS stats updates

---

### 4. Analysis Logs Channel (existing - renamed for clarity)

**Key:** `logs:{analysisId}`

**Purpose:** Heavy log line streaming for Log Viewer only

**Subscribe:** When Log Viewer component mounts
**Unsubscribe:** When Log Viewer unmounts

**Broadcasts:**

- `log` - individual log entries only

---

## API Endpoints

### Subscription Endpoints

```
POST /api/sse/subscribe/stats
Body: { sessionId, analyses: [id1, id2, ...] }

POST /api/sse/subscribe/logs
Body: { sessionId, analyses: [id1, id2, ...] }

POST /api/sse/subscribe/metrics
Body: { sessionId }

POST /api/sse/unsubscribe/stats
Body: { sessionId, analyses: [id1, id2, ...] }

POST /api/sse/unsubscribe/logs
Body: { sessionId, analyses: [id1, id2, ...] }

POST /api/sse/unsubscribe/metrics
Body: { sessionId }
```

---

## Frontend Usage Patterns

### Info Modal

```javascript
useEffect(() => {
  subscribeToAnalysisStats([analysisId]);
  return () => unsubscribeFromAnalysisStats([analysisId]);
}, [analysisId]);
```

### Log Viewer

```javascript
useEffect(() => {
  subscribeToAnalysisLogs([analysisId]);
  return () => unsubscribeFromAnalysisLogs([analysisId]);
}, [analysisId]);
```

### Settings/Metrics Dashboard

```javascript
useEffect(() => {
  subscribeToMetrics();
  return () => unsubscribeFromMetrics();
}, []);
```

---

## Data Flow Comparison

### Before (wasteful)

```
Analysis Info Modal opens
  → subscribes to analysis channel
  → receives ALL log lines (hundreds/thousands)
  → only needs: log count, file size, DNS stats, metrics
```

### After (efficient)

```
Analysis Info Modal opens
  → subscribes to stats channel
  → receives ONLY: log count, file size, DNS stats, metrics
  → lightweight, immediate response
```

---

## Implementation Checklist

### Backend

- [ ] Add `analysisStatsChannels: Map<string, Channel>` to SSEManager
- [ ] Add `metricsChannel: Channel` to SSEManager
- [ ] Rename `analysisChannels` to `analysisLogsChannels`
- [ ] Add subscription methods: `subscribeToStats()`, `subscribeToLogs()`, `subscribeToMetrics()`
- [ ] Add unsubscription methods
- [ ] Update log broadcast to only go to logs channel
- [ ] Add stats broadcast on log write (count, size only)
- [ ] Send initial stats on stats channel subscription
- [ ] Route metrics to metrics channel subscribers only
- [ ] Add HTTP endpoints for new subscription types

### Frontend

- [ ] Add `subscribeToAnalysisStats()` to connection context
- [ ] Add `subscribeToAnalysisLogs()` to connection context
- [ ] Add `subscribeToMetrics()` to connection context
- [ ] Handle `analysisLogStats` message type
- [ ] Handle `analysisProcessMetrics` message type
- [ ] Update Info Modal to use stats channel
- [ ] Update Log Viewer to use logs channel
- [ ] Update Settings to subscribe to metrics channel
- [ ] Remove old `subscribeToAnalysis()` usage

---

## Migration Strategy

1. Add new channels alongside existing ones
2. Add new subscription endpoints
3. Update frontend to use new endpoints
4. Deprecate old single-channel approach
5. Remove old code after verification
