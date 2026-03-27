import { InputError } from '@backstage/errors';
import { stringifyEntityRef } from '@backstage/catalog-model';
import { matchesFilter } from '../helpers';
import { ActionOptions, TechInsightsCheck } from './types';

const RANK_LABELS = ['🪨 Stone', '🥉 Bronze', '🥈 Silver', '🥇 Gold'] as const;

function calculateMaturity(
  checks: TechInsightsCheck[],
  resultMap: Map<string, { check: { id: string }; result: boolean }>,
) {
  let maxRank = 0;
  for (const check of checks) {
    const rank = (check.metadata?.rank as number) ?? 0;
    if (rank > maxRank) maxRank = rank;
  }

  let rank = maxRank;

  for (const check of checks) {
    const checkRank = (check.metadata?.rank as number) ?? 0;
    const r = resultMap.get(check.id);
    const passed = r?.result ?? false;

    if (!passed && checkRank <= rank) {
      rank = checkRank - 1;
    }
  }

  if (rank < 0) rank = 0;

  return {
    rank: RANK_LABELS[rank] ?? '🪨 Stone',
    maxRank: RANK_LABELS[maxRank] ?? '🪨 Stone',
    isMaxRank: rank === maxRank,
  };
}

export const createGetEntityMaturityAction = ({
  actionsRegistry,
  tiRequest,
  catalogRequest,
}: ActionOptions) => {
  actionsRegistry.register({
    name: 'get-entity-maturity',
    title: 'Get Entity Maturity',
    description: [
      'Returns the maturity rank for an entity based on its tech-insights check results.',
      '',
      'Maturity ranks from lowest to highest: Stone → Bronze → Silver → Gold.',
      'Each check has a rank level (Bronze=1, Silver=2, Gold=3). The entity starts',
      'at the highest possible rank and drops down for each failing check whose rank',
      'is at or below the current rank.',
      '',
      'Returns the current rank, maximum achievable rank,',
      'and a per-category breakdown showing passed/failed checks at each rank level.',
      'Failing checks include solution hints and documentation links when available.',
      '',
      'Use get-entity-scorecard for a simpler pass/fail compliance view without rank info.',
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
        }),
      output: z =>
        z.object({
          entity: z
            .string()
            .describe('Entity reference (kind:namespace/name)'),
          rank: z
            .string()
            .describe(
              'Current maturity rank with emoji (e.g., 🥇 Gold)',
            ),
          maxRank: z
            .string()
            .describe('Maximum achievable rank based on configured checks'),
          isMaxRank: z
            .boolean()
            .describe('Whether the entity has achieved the maximum rank'),
          categories: z.array(
            z.object({
              name: z.string().describe('Category name'),
              checks: z.array(
                z.object({
                  name: z.string(),
                  rank: z
                    .string()
                    .describe(
                      'Check rank level with emoji (e.g., 🥉 Bronze)',
                    ),
                  result: z.enum(['PASS', 'FAIL', 'N/A']),
                  solution: z
                    .string()
                    .optional()
                    .describe('Suggested fix with documentation link (only for failures)'),
                }),
              ),
            }),
          ),
        }),
    },
    action: async ({ input }) => {
      if (!input.kind.trim() || !input.name.trim()) {
        throw new InputError('kind and name must be non-empty strings');
      }
      const { kind, namespace, name } = input;

      // 1. Fetch entity from catalog
      const catalogEntity = await catalogRequest(
        `/entities/by-name/${encodeURIComponent(kind)}/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}`,
      );

      // 2. Get all checks and filter to applicable ones
      const allChecks: TechInsightsCheck[] = await tiRequest('/checks');

      const applicable = allChecks.filter(
        check =>
          !check.filter || matchesFilter(catalogEntity, check.filter),
      );

      // 3. Run applicable checks
      let checkResults: Array<{
        check: { id: string };
        result: boolean;
        facts: Record<string, unknown>;
      }> = [];

      if (applicable.length > 0) {
        const applicableIds = applicable.map(c => c.id);
        checkResults = await tiRequest(
          `/checks/run/${encodeURIComponent(namespace)}/${encodeURIComponent(kind)}/${encodeURIComponent(name)}`,
          { method: 'POST', body: { checks: applicableIds } },
        );
      }

      const resultMap = new Map(
        checkResults.map(r => [r.check.id, r]),
      );

      // 4. Calculate maturity
      const maturity = calculateMaturity(applicable, resultMap);

      // 5. Group by category with rank info
      const categoryMap = new Map<
        string,
        Array<{
          name: string;
          rank: string;
          result: 'PASS' | 'FAIL' | 'N/A';
          solution?: string;
        }>
      >();

      for (const check of applicable) {
        const category =
          (check.metadata?.category as string) ?? 'Uncategorized';
        const checkRank = (check.metadata?.rank as number) ?? 0;
        const r = resultMap.get(check.id);
        const passed = r ? r.result : null;
        const docUrl = check.links?.[0]?.url;

        let solution: string | undefined;
        if (passed === false) {
          const hint = check.metadata?.solution as string | undefined;
          if (hint && docUrl) {
            solution = `${hint}. Refer: ${docUrl}`;
          } else if (hint) {
            solution = hint;
          } else if (docUrl) {
            solution = `Refer: ${docUrl}`;
          }
        }

        const entry = {
          name: check.name,
          rank: RANK_LABELS[checkRank] ?? '🪨 Stone',
          result: (passed === true
            ? 'PASS'
            : passed === false
              ? 'FAIL'
              : 'N/A') as 'PASS' | 'FAIL' | 'N/A',
          ...(solution ? { solution } : {}),
        };

        if (!categoryMap.has(category)) {
          categoryMap.set(category, []);
        }
        categoryMap.get(category)!.push(entry);
      }

      const categories = Array.from(categoryMap.entries()).map(
        ([categoryName, checks]) => ({
          name: categoryName,
          checks,
        }),
      );

      const entityRef = stringifyEntityRef({ kind, namespace, name });

      return {
        output: {
          entity: entityRef,
          rank: maturity.rank,
          maxRank: maturity.maxRank,
          isMaxRank: maturity.isMaxRank,
          categories,
        },
      };
    },
  });
};
