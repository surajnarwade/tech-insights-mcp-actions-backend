import { InputError } from '@backstage/errors';
import { stringifyEntityRef } from '@backstage/catalog-model';
import { ActionOptions } from './types';

export const createGetFactsRangeAction = ({
  actionsRegistry,
  tiRequest,
}: ActionOptions) => {
  actionsRegistry.register({
    name: 'get-facts-range',
    title: 'Get Facts in Date Range',
    description: [
      'Retrieve historical facts for a specific entity within a date range.',
      '',
      'Returns all fact snapshots collected between the start and end datetimes.',
      "Useful for tracking how an entity's compliance has changed over time.",
      '',
      'Dates must be in ISO 8601 format, e.g.:',
      '  startDatetime: "2024-01-01T00:00:00"',
      '  endDatetime: "2024-12-31T23:59:59"',
    ].join('\n'),
    attributes: { readOnly: true, idempotent: true },
    schema: {
      input: z =>
        z.object({
          kind: z.string().describe('Entity kind (e.g., Component)'),
          namespace: z
            .string()
            .default('default')
            .describe('Entity namespace'),
          name: z.string().describe('Entity name'),
          ids: z
            .array(z.string())
            .min(1)
            .describe('List of fact retriever IDs'),
          startDatetime: z
            .string()
            .describe(
              'Start datetime in ISO 8601 format (e.g., 2024-01-01T00:00:00)',
            ),
          endDatetime: z
            .string()
            .describe(
              'End datetime in ISO 8601 format (e.g., 2024-12-31T23:59:59)',
            ),
        }),
      output: z =>
        z.object({
          facts: z
            .record(z.unknown())
            .describe('Facts data within the date range'),
        }),
    },
    action: async ({ input }) => {
      if (!input.kind.trim() || !input.name.trim()) {
        throw new InputError('kind and name must be non-empty strings');
      }
      const { kind, namespace, name, ids, startDatetime, endDatetime } =
        input;

      if (isNaN(Date.parse(startDatetime))) {
        throw new InputError(
          `Invalid startDatetime: '${startDatetime}'. Must be ISO 8601 format.`,
        );
      }
      if (isNaN(Date.parse(endDatetime))) {
        throw new InputError(
          `Invalid endDatetime: '${endDatetime}'. Must be ISO 8601 format.`,
        );
      }

      const entityRef = stringifyEntityRef({ kind, namespace, name });
      const params = new URLSearchParams();
      params.append('entity', entityRef);
      for (const id of ids) {
        params.append('ids[]', id);
      }
      params.append('startDatetime', startDatetime);
      params.append('endDatetime', endDatetime);
      const facts = await tiRequest(
        `/facts/range?${params.toString()}`,
      );
      return { output: { facts } };
    },
  });
};
