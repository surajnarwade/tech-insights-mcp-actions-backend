import { ActionsRegistryService } from '@backstage/backend-plugin-api/alpha';

export type TechInsightsRequest = (
  path: string,
  options?: { method?: string; body?: unknown },
) => Promise<any>;

export type CatalogRequest = (path: string) => Promise<any>;

export type ActionOptions = {
  actionsRegistry: ActionsRegistryService;
  tiRequest: TechInsightsRequest;
  catalogRequest: CatalogRequest;
};

export type TechInsightsCheck = {
  id: string;
  name: string;
  description: string;
  factIds: string[];
  filter?: Record<string, unknown> | Record<string, unknown>[];
  metadata?: Record<string, unknown>;
  links?: Array<{ title: string; url: string }>;
};
