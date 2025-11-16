import { useState } from 'react';
import { Stack, Text, ScrollArea, Group, Tabs } from '@mantine/core';
import { IconInfoCircle, IconCode } from '@tabler/icons-react';
import { FormAlert, PaperCard, LoadingState } from '../../../components/global';
import { utilsDocsService } from '../../../services/utilsDocsService';
import { useAsyncMount } from '../../../hooks/async';

/**
 * UtilsDocs Component
 *
 * Displays documentation for in-process utility modules available to analysis scripts.
 * Shows OpenAPI specification with function signatures, parameters, and examples.
 */
function UtilsDocs() {
  const [docs, setDocs] = useState(null);
  const [activeTab, setActiveTab] = useState(null);

  // Load documentation on component mount
  const loadDocsOperation = useAsyncMount(async () => {
    const response = await utilsDocsService.getDocs();
    setDocs(response);

    // Set the first file as the active tab
    if (response?.paths) {
      const firstPath = Object.keys(response.paths)[0];
      if (firstPath) {
        const fileName = firstPath.split('/')[1]; // Extract file name from /fileName/functionName
        setActiveTab(fileName);
      }
    }

    return response;
  });

  // Group paths by file name
  const groupedPaths = docs?.paths
    ? Object.entries(docs.paths).reduce((acc, [path, methods]) => {
        const fileName = path.split('/')[1]; // Extract file name from /fileName/functionName
        if (!acc[fileName]) {
          acc[fileName] = [];
        }
        acc[fileName].push([path, methods]);
        return acc;
      }, {})
    : {};

  if (loadDocsOperation.error) {
    return (
      <FormAlert
        type="error"
        message={
          loadDocsOperation.error.message || 'Failed to load documentation'
        }
      />
    );
  }

  return (
    <Stack gap="md">
      <Text size="lg" fw={600} mb="sm">
        In-Process Utilities Documentation
      </Text>

      {docs && Object.keys(groupedPaths).length > 0 && (
        <Tabs value={activeTab} onChange={setActiveTab}>
          <Tabs.List>
            {Object.keys(groupedPaths).map((fileName) => (
              <Tabs.Tab key={fileName} value={fileName}>
                {fileName}
              </Tabs.Tab>
            ))}
          </Tabs.List>
        </Tabs>
      )}

      {activeTab && (
        <FormAlert
          type="info"
          icon={<IconInfoCircle size={16} />}
          message={
            <>
              These utilities are available in your analysis scripts via{' '}
              <code>
                import {`{ ${activeTab} }`} from &apos;#tago-utils&apos;
              </code>
            </>
          }
        />
      )}

      <ScrollArea h={500}>
        <LoadingState
          loading={loadDocsOperation.loading}
          skeleton
          pattern="content"
          skeletonCount={4}
        >
          {docs && activeTab && groupedPaths[activeTab] && (
            <Stack gap="lg">
              {groupedPaths[activeTab].map(([path, methods]) => (
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
      </ScrollArea>
    </Stack>
  );
}

export default UtilsDocs;
