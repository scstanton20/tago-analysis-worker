import type { OpenAPIRegistry } from '@tago-analysis-worker/types/openapi';
import { registerAuthPaths } from './authPaths.ts';
import { registerMetricsPaths } from './metricsPaths.ts';
import { registerStatusPaths } from './statusPaths.ts';
import { registerUtilsDocsPaths } from './utilsDocsPaths.ts';
import { registerUserPaths } from './userPaths.ts';
import { registerSSEPaths } from './ssePaths.ts';
import { registerSettingsPaths } from './settingsPaths.ts';
import { registerTeamPaths } from './teamPaths.ts';
import { registerAnalysisPaths } from './analysisPaths.ts';

export function registerAllPaths(registry: OpenAPIRegistry): void {
  registerAuthPaths(registry);
  registerMetricsPaths(registry);
  registerStatusPaths(registry);
  registerUtilsDocsPaths(registry);
  registerUserPaths(registry);
  registerSSEPaths(registry);
  registerSettingsPaths(registry);
  registerTeamPaths(registry);
  registerAnalysisPaths(registry);
}
