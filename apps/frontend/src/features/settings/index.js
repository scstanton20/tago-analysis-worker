// Settings feature - public API
export { dnsService } from './api/dnsService';
export { utilsDocsService } from './api/utilsDocsService';

// Components
export { default as MetricsDashboard } from './components/MetricsDashboard';
export { default as DNSCacheSettings } from './components/DNSCacheSettings';
export { default as UtilsDocs } from './components/UtilsDocs';

// Note: Modals are NOT exported here - they are lazy loaded via modals/registry.jsx
// Use modalService.openSettings() to open modals
