# SSRF Protection Documentation

## Overview

Server-Side Request Forgery (SSRF) protection has been implemented to prevent user-uploaded analysis code from making unauthorized requests to internal services, cloud metadata endpoints, and private network resources.

## Implementation Architecture

### Protection Layers

SSRF protection is implemented at the DNS resolution layer through two mechanisms:

1. **Parent Process Interceptors** (`dnsCache.js`)
   - Intercepts `dns.lookup()`, `dnsPromises.resolve4()`, and `dnsPromises.resolve6()`
   - Validates hostnames and resolved addresses before returning results
   - Applies to backend server operations and any direct network calls

2. **Child Process IPC Handlers** (`dnsCache.js`)
   - Handles DNS resolution requests from analysis child processes via IPC
   - Applies same validation rules to all analysis-initiated requests
   - Prevents bypass through direct DNS API usage

### Protection Module (`ssrfProtection.js`)

The SSRF protection module provides validation functions:

- `validateHostname(hostname)` - Validates hostname before DNS resolution
- `validateResolvedAddress(hostname, address, family)` - Validates single resolved IP
- `validateResolvedAddresses(hostname, addresses)` - Validates array of resolved IPs

## Blocked Resources

### IPv4 Private Ranges

All requests to the following IPv4 ranges are blocked:

- **10.0.0.0/8** - Private network
- **172.16.0.0/12** - Private network
- **192.168.0.0/16** - Private network
- **127.0.0.0/8** - Loopback addresses
- **169.254.0.0/16** - Link-local (includes AWS metadata endpoint 169.254.169.254)
- **100.64.0.0/10** - Carrier-grade NAT
- **224.0.0.0/4** - Multicast
- **240.0.0.0/4** - Reserved
- **0.0.0.0/8** - This network

### IPv6 Blocked Patterns

- **::1** - Loopback
- **::ffff:** - IPv4-mapped IPv6 addresses
- **fe80:** - Link-local addresses
- **fc00:** - Unique local addresses (ULA)
- **fd00:** - Unique local addresses (ULA)
- **ff00:** - Multicast

### Blocked Hostnames

Case-insensitive matches for:

- **localhost** - Local machine
- **metadata** - AWS metadata service
- **metadata.google.internal** - GCP metadata service
- **169.254.169.254** - Direct AWS metadata IP

## Protection Flow

### 1. Hostname Validation (Pre-Resolution)

Before DNS resolution occurs:

1. Check if hostname matches blocked hostnames list
2. Check if hostname is a direct IP address (IPv4 or IPv6)
3. If direct IP, validate it's not in a blocked range
4. Reject with error if validation fails

### 2. Address Validation (Post-Resolution)

After DNS resolution:

1. Validate each resolved IP address
2. For IPv4: Check against blocked IP ranges
3. For IPv6: Check against blocked patterns
4. Filter out blocked addresses from results
5. Reject if all addresses are blocked
6. Allow with filtered list if some addresses are safe

### 3. Error Handling

Blocked requests receive:

- Error code: `ENOTFOUND`
- Error message: Descriptive reason for blocking (includes hostname/IP)
- Logging: Warning level logs for security monitoring

## Security Benefits

### Attack Prevention

1. **Cloud Metadata Access** - Prevents access to AWS (169.254.169.254), GCP, Azure metadata endpoints
2. **Internal Network Scanning** - Blocks access to private IP ranges (10.x.x.x, 192.168.x.x, etc.)
3. **Localhost Exploitation** - Prevents attacks on localhost services (127.0.0.1)
4. **DNS Rebinding Protection** - Validates resolved IPs even if hostname appears legitimate

### Defense in Depth

- **DNS Layer Protection** - Intercepts at DNS resolution, before any connection attempts
- **Both Validation Points** - Checks both hostname and resolved IP addresses
- **Parent and Child Coverage** - Protects both server operations and analysis processes
- **Cannot Be Bypassed** - User code cannot access underlying DNS functions

## Logging and Monitoring

### Log Events

All blocked requests generate warning-level logs with:

```javascript
{
  hostname: "blocked-hostname",
  address: "resolved-ip",
  family: 4,
  reason: "Descriptive block reason"
}
```

### Log Search Queries

Monitor SSRF attempts with these log queries:

```
# Loki/LogQL
{module="ssrf-protection"} |= "validation failed"

# Grep backend logs
grep "SSRF:" analysis-worker.log
```

### Metrics

SSRF protection increments DNS error metrics:

- `dns_cache_errors_total` - Prometheus metric
- DNS service `stats.errors` counter

## Configuration

### DNS Cache Requirement

SSRF protection requires DNS caching to be enabled:

1. Navigate to DNS Cache settings in the application
2. Enable DNS caching
3. SSRF protection is automatically active when DNS cache is enabled

**Note**: SSRF protection only works when DNS caching is enabled. When DNS cache is disabled, analysis processes use Node.js default DNS resolution without protection.

### Environment Variables

DNS cache (and SSRF protection) is configured via:

- `DNS_CACHE_ENABLED` - Set to "true" to enable (enables SSRF protection)
- `DNS_CACHE_TTL` - Cache TTL in milliseconds
- `DNS_CACHE_MAX_ENTRIES` - Maximum cache entries

## Testing SSRF Protection

### Test Cases

**Test 1: Block localhost access**

```javascript
// In analysis code
const response = await fetch('http://localhost:3000/api/sensitive');
// Expected: DNS error - hostname blocked
```

**Test 2: Block AWS metadata**

```javascript
const response = await fetch('http://169.254.169.254/latest/meta-data/');
// Expected: DNS error - private IP blocked
```

**Test 3: Block private network**

```javascript
const response = await fetch('http://192.168.1.1/admin');
// Expected: DNS error - private IP blocked
```

**Test 4: Allow public domains**

```javascript
const response = await fetch('https://api.tago.io/');
// Expected: Success (public domain allowed)
```

### DNS Rebinding Test

```javascript
// Domain that resolves to private IP
const response = await fetch('http://malicious-domain-to-private-ip.com/');
// Expected: DNS error - resolved to private IP
```

## Limitations and Considerations

### Current Coverage

- ✅ HTTP/HTTPS requests (via dns.lookup)
- ✅ Direct socket connections
- ✅ Child process DNS requests
- ✅ IPv4 and IPv6 validation

### Known Limitations

1. **DNS Cache Dependency** - Protection only active when DNS cache is enabled
2. **Time-of-Check-Time-of-Use** - Small window between validation and connection
3. **IPv6 Support** - Pattern-based validation (not as comprehensive as IPv4 CIDR)
4. **No Application Layer Filtering** - Only DNS-level protection

### Recommended Additional Protections

For defense in depth, consider:

1. **Network Policies** - Docker/Kubernetes network policies
2. **Firewall Rules** - OS-level outbound traffic filtering
3. **Container Isolation** - Run analysis processes in isolated containers
4. **Resource Limits** - CPU/memory/network rate limiting

## Incident Response

### If SSRF is Detected

1. **Review Logs** - Check `ssrf-protection` logs for attempted access patterns
2. **Identify Analysis** - Determine which analysis attempted the SSRF
3. **Review Code** - Examine analysis code for malicious intent vs. misconfiguration
4. **Disable Analysis** - Stop the problematic analysis
5. **Investigate User** - Check if user account is compromised

### Example Log Query

```bash
# Find all SSRF attempts in the last 24 hours
docker logs tago-analysis-backend 2>&1 | grep "SSRF:" | grep "$(date +%Y-%m-%d)"
```

## Security Recommendations

### For Administrators

1. **Keep DNS Cache Enabled** - Ensures SSRF protection is active
2. **Monitor SSRF Logs** - Set up alerts for SSRF attempts
3. **Review Analysis Code** - Audit uploaded analysis code before enabling
4. **User Training** - Educate users about allowed network access patterns

### For Analysis Developers

1. **Use Public APIs Only** - Analysis should only access public internet resources
2. **Avoid Internal Services** - Don't attempt to access localhost or private networks
3. **Handle DNS Errors** - Implement proper error handling for network requests
4. **Test Externally** - Test analysis against public endpoints before upload

## Version History

- **v1.0.0** (2025-01-10) - Initial implementation
  - DNS-layer SSRF protection
  - IPv4/IPv6 validation
  - IPC handler protection
  - Comprehensive logging
