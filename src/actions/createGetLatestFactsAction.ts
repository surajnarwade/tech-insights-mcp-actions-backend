import { InputError } from '@backstage/errors';
import { stringifyEntityRef } from '@backstage/catalog-model';
import { ActionOptions } from './types';

export const createGetLatestFactsAction = ({
  actionsRegistry,
  tiRequest,
}: ActionOptions) => {
  actionsRegistry.register({
    name: 'get-latest-facts',
    title: 'Get Latest Facts',
    description: [
      'Retrieve the latest facts collected for a specific entity.',
      '',
      'Facts are data points gathered by fact retrievers (e.g., entityMetadataFactRetriever,',
      'entityOwnershipFactRetriever, techdocsFactRetriever). Each fact retriever collects',
      'specific boolean or numeric facts about entities on a configured schedule.',
      '',
      'You must specify at least one fact retriever ID. Use get-fact-schemas to discover available retrievers.',
    ].join('\n'),
    attributes: { readOnly: true, idempotent: true },
    schema: {
      input: z =>
        z.object({
          kind: z
            .string()
            .describe('Entity kind (e.g., Component, API, System)'),
          namespace: z
            .string()
            .default('default')
            .describe('Entity namespace'),
          name: z.string().describe('Entity name'),
          ids: z
            .array(z.string())
            .min(1)
            .describe(
              'List of fact retriever IDs (e.g., ["entityMetadataFactRetriever", "entityOwnershipFactRetriever"])',
            ),
        }),
      output: z =>
        z.object({
          facts: z
            .record(z.unknown())
            .describe('Latest facts keyed by retriever ID'),
        }),
    },
    action: async ({ input }) => {
      if (!input.kind.trim() || !input.name.trim()) {
        throw new InputError('kind and name must be non-empty strings');
      }
      const { kind, namespace, name, ids } = input;
      const entityRef = stringifyEntityRef({ kind, namespace, name });
      const params = new URLSearchParams();
      params.append('entity', entityRef);
      for (const id of ids) {
        params.append('ids[]', id);
      }
      const facts = await tiRequest(
        `/facts/latest?${params.toString()}`,
      );
      return { output: { facts } };
    },
  });
};
