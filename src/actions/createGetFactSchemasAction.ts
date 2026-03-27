import { ActionOptions } from './types';

export const createGetFactSchemasAction = ({
  actionsRegistry,
  tiRequest,
}: ActionOptions) => {
  actionsRegistry.register({
    name: 'get-fact-schemas',
    title: 'Get Fact Schemas',
    description: [
      'Retrieve fact schemas that describe the structure of facts collected by fact retrievers.',
      '',
      'Each schema defines the fields (facts) a retriever collects, their types, and descriptions.',
      'Optionally filter by specific fact retriever IDs.',
    ].join('\n'),
    attributes: { readOnly: true, idempotent: true },
    schema: {
      input: z =>
        z.object({
          ids: z
            .array(z.string())
            .optional()
            .describe(
              'Optional list of fact retriever IDs to filter by (e.g., entityMetadataFactRetriever)',
            ),
        }),
      output: z =>
        z.object({
          schemas: z
            .array(z.record(z.unknown()))
            .describe('List of fact schemas'),
        }),
    },
    action: async ({ input }) => {
      const params = new URLSearchParams();
      if (input.ids) {
        for (const id of input.ids) {
          params.append('ids', id);
        }
      }
      const query = params.toString();
      const schemas = await tiRequest(
        `/fact-schemas${query ? `?${query}` : ''}`,
      );
      return { output: { schemas } };
    },
  });
};
