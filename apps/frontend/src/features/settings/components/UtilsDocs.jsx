import { useState } from 'react';
import { Stack, Text, Group, Tabs, Anchor, Code, Select } from '@mantine/core';
import {
  IconInfoCircle,
  IconCode,
  IconPackage,
  IconExternalLink,
  IconTool,
} from '@tabler/icons-react';
import { FormAlert, PaperCard, LoadingState } from '@/components/global';
import { useAsyncMountOnce } from '@/hooks/async';
import { utilsDocsService } from '../api/utilsDocsService';

/**
 * UtilsDocs Component
 *
 * Displays documentation for in-process utility modules available to analysis scripts.
 * Shows OpenAPI specification with function signatures, parameters, and examples.
 */
function UtilsDocs() {
  const [packages, setPackages] = useState([]);
  const [utilities, setUtilities] = useState([]);
  const [openApiDocs, setOpenApiDocs] = useState(null);
  const [activeTab, setActiveTab] = useState('packages');
  const [selectedUtility, setSelectedUtility] = useState(null);

  // Load overview (packages + utilities lists)
  const loadOverviewOperation = useAsyncMountOnce(async () => {
    const response = await utilsDocsService.getOverview();
    setPackages(response.packages || []);
    setUtilities(response.utilities || []);
    // Set the first utility as selected if available
    if (response.utilities?.length > 0) {
      setSelectedUtility(response.utilities[0].name);
    }
    return response;
  });

  // Load OpenAPI documentation for utilities
  const loadDocsOperation = useAsyncMountOnce(async () => {
    const response = await utilsDocsService.getUtilities();
    setOpenApiDocs(response);
    return response;
  });

  // Group paths by file name (utility name)
  const groupedPaths = openApiDocs?.paths
    ? Object.entries(openApiDocs.paths).reduce((acc, [path, methods]) => {
        const fileName = path.split('/')[1]; // Extract file name from /fileName/functionName
        if (!acc[fileName]) {
          acc[fileName] = [];
        }
        acc[fileName].push([path, methods]);
        return acc;
      }, {})
    : {};

  // Get utility names for dropdown from utilities list
  const utilityOptions = utilities.map((util) => ({
    value: util.name,
    label: util.name,
  }));

  const hasError = loadOverviewOperation.error || loadDocsOperation.error;

  if (hasError) {
    return (
      <FormAlert
        type="error"
        message={
          loadOverviewOperation.error?.message ||
          loadDocsOperation.error?.message ||
          'Failed to load documentation'
        }
      />
    );
  }

  return (
    <Stack gap="md">
      <Text size="lg" fw={600} mb="sm">
        Available In-Process Utilities & Packages Documentation
      </Text>

      <Tabs value={activeTab} onChange={setActiveTab} color="brand">
        <Tabs.List>
          <Tabs.Tab value="packages" leftSection={<IconPackage size={14} />}>
            Packages
          </Tabs.Tab>
          <Tabs.Tab value="utilities" leftSection={<IconTool size={14} />}>
            Utilities
          </Tabs.Tab>
        </Tabs.List>
      </Tabs>

      {activeTab === 'packages' && (
        <FormAlert
          type="info"
          icon={<IconInfoCircle size={16} />}
          message="These packages are available to import directly in your analysis scripts."
        />
      )}

      {activeTab === 'utilities' && (
        <>
          <FormAlert
            type="info"
            icon={<IconInfoCircle size={16} />}
            message={
              selectedUtility ? (
                <>
                  These utilities are available in your analysis scripts via{' '}
                  <code>
                    import {`{ ${selectedUtility} }`} from
                    &apos;#tago-utils&apos;
                  </code>
                </>
              ) : (
                'Select a utility to view its documentation.'
              )
            }
          />
          <Select
            placeholder="Select a utility"
            data={utilityOptions}
            value={selectedUtility}
            onChange={setSelectedUtility}
            leftSection={<IconTool size={16} />}
            clearable={false}
            allowDeselect={false}
          />
        </>
      )}

      {activeTab === 'packages' && (
        <LoadingState
          loading={loadOverviewOperation.loading}
          skeleton
          pattern="content"
          skeletonCount={2}
        >
          <Stack gap="md">
            {packages.map((pkg) => (
              <PaperCard key={pkg.name} withBorder>
                <Stack gap="sm">
                  <Group justify="space-between">
                    <Text size="md" fw={600}>
                      <IconPackage
                        size={16}
                        style={{ verticalAlign: 'middle', marginRight: 6 }}
                      />
                      {pkg.name}
                    </Text>
                    <Anchor
                      href={pkg.docsUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      size="sm"
                    >
                      <Group gap={4}>
                        Documentation
                        <IconExternalLink size={14} />
                      </Group>
                    </Anchor>
                  </Group>
                  <Text size="sm" c="dimmed">
                    {pkg.description}
                  </Text>
                  <Code block>{pkg.import}</Code>
                </Stack>
              </PaperCard>
            ))}
          </Stack>
        </LoadingState>
      )}

      {activeTab === 'utilities' && (
        <LoadingState
          loading={loadOverviewOperation.loading || loadDocsOperation.loading}
          skeleton
          pattern="content"
          skeletonCount={4}
        >
          {openApiDocs && selectedUtility && groupedPaths[selectedUtility] && (
            <Stack gap="lg">
              {groupedPaths[selectedUtility].map(([path, methods]) => (
                <PaperCard key={path} withBorder>
                  <Stack gap="sm">
                    <Group justify="apart">
                      <Text size="md" fw={600}>
                        <IconCode
                          size={16}
                          style={{ verticalAlign: 'middle' }}
                        />{' '}
                        {path.split('/').pop()}
                      </Text>
                    </Group>

                    {Object.entries(methods).map(([method, details]) => (
                      <Stack key={method} gap="xs">
                        <Text size="sm">{details.description}</Text>

                        {details.parameters &&
                          details.parameters.length > 0 && (
                            <Stack gap="xs">
                              <Text size="sm" fw={500}>
                                Parameters:
                              </Text>
                              {details.parameters.map((param, idx) => (
                                <div key={idx} style={{ paddingLeft: '1rem' }}>
                                  <Text size="sm" c="dimmed">
                                    <code>{param.name}</code> (
                                    {param.schema.type}){param.required && ' *'}
                                    {param.description &&
                                      ` - ${param.description}`}
                                  </Text>
                                </div>
                              ))}
                            </Stack>
                          )}

                        {details['x-code-samples'] &&
                          details['x-code-samples'].length > 0 && (
                            <Stack gap="xs">
                              <Text size="sm" fw={500}>
                                Example:
                              </Text>
                              <pre
                                style={{
                                  padding: '0.75rem',
                                  borderRadius: '4px',
                                  overflow: 'auto',
                                  maxWidth: '100%',
                                  whiteSpace: 'pre-wrap',
                                  wordBreak: 'break-word',
                                }}
                              >
                                <code>
                                  {details['x-code-samples'][0].source}
                                </code>
                              </pre>
                            </Stack>
                          )}
                      </Stack>
                    ))}
                  </Stack>
                </PaperCard>
              ))}
            </Stack>
          )}
        </LoadingState>
      )}
    </Stack>
  );
}

export default UtilsDocs;
