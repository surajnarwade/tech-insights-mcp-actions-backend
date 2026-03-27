import {
  coreServices,
  createBackendPlugin,
} from '@backstage/backend-plugin-api';
import { actionsRegistryServiceRef } from '@backstage/backend-plugin-api/alpha';
import { makeRequest } from './helpers';
import { createTechInsightsActions } from './actions';

export const techInsightsMcpActionsPlugin = createBackendPlugin({
  pluginId: 'tech-insights-mcp-actions',
  register(env) {
    env.registerInit({
      deps: {
        actionsRegistry: actionsRegistryServiceRef,
        discovery: coreServices.discovery,
        auth: coreServices.auth,
        logger: coreServices.logger,
      },
      async init({ actionsRegistry, discovery, auth, logger }) {
        const tiRequest = (
          path: string,
          options?: { method?: string; body?: unknown },
        ) => makeRequest(discovery, auth, 'tech-insights', path, options);

        const catalogRequest = (path: string) =>
          makeRequest(discovery, auth, 'catalog', path);

        createTechInsightsActions({
          actionsRegistry,
          tiRequest,
          catalogRequest,
        });

        logger.info('Registered tech-insights MCP actions');
      },
    });
  },
});
