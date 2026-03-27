import { ActionOptions } from './types';

export const createGetChecksAction = ({
  actionsRegistry,
  tiRequest,
}: ActionOptions) => {
  actionsRegistry.register({
    name: 'get-checks',
    title: 'Get Tech Insights Checks',
    description: [
      'Retrieve all available tech-insights checks configured in the Backstage instance.',
      '',
      'Each check has:',
      '- id/name: unique identifier',
      '- description: what the check verifies',
      '- factIds: which fact retrievers supply data for this check',
      '- filter (optional): entity filter that restricts which entities this check applies to',
      '- rule: the json-rules-engine rule that evaluates pass/fail',
      '- metadata: category, rank, and suggested solution',
      '',
      'Checks with a filter only apply to entities matching that filter.',
      'Use get-entity-insights to see which checks apply to a specific entity.',
    ].join('\n'),
    attributes: { readOnly: true, idempotent: true },
    schema: {
      input: z => z.object({}),
      output: z =>
        z.object({
          checks: z
            .array(z.record(z.unknown()))
            .describe('List of all configured checks'),
        }),
    },
    action: async () => {
      const checks = await tiRequest('/checks');
      return { output: { checks } };
    },
  });
};
