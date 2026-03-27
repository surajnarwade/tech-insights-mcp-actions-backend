import { InputError } from '@backstage/errors';
import { ActionOptions } from './types';

export const createRunChecksAction = ({
  actionsRegistry,
  tiRequest,
}: ActionOptions) => {
  actionsRegistry.register({
    name: 'run-checks',
    title: 'Run Tech Insights Checks',
    description: [
      'Run tech-insights checks against a specific entity.',
      '',
      'Optionally specify which check IDs to run. If omitted, all checks are run.',
      'Note: checks with filters that do not match the entity will be silently excluded by the server.',
      'If you get empty results, the entity may not match any check filters.',
      'Use get-entity-insights instead for a full report that explains which checks were skipped and why.',
    ].join('\n'),
    attributes: { idempotent: true },
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
          checks: z
            .array(z.string())
            .optional()
            .describe(
              'Optional list of check IDs to run. If omitted, all applicable checks are run.',
            ),
        }),
      output: z =>
        z.object({
          results: z
            .array(z.record(z.unknown()))
            .describe('Check results for the entity'),
        }),
    },
    action: async ({ input }) => {
      if (!input.kind.trim() || !input.name.trim()) {
        throw new InputError('kind and name must be non-empty strings');
      }
      const { namespace, kind, name, checks } = input;
      const results = await tiRequest(
        `/checks/run/${encodeURIComponent(namespace)}/${encodeURIComponent(kind)}/${encodeURIComponent(name)}`,
        { method: 'POST', body: { checks: checks ?? [] } },
      );
      return { output: { results } };
    },
  });
};
