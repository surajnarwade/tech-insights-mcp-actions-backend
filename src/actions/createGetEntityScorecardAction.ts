import { InputError } from '@backstage/errors';
import { stringifyEntityRef } from '@backstage/catalog-model';
import { matchesFilter } from '../helpers';
import { ActionOptions, TechInsightsCheck } from './types';

export const createGetEntityScorecardAction = ({
  actionsRegistry,
  tiRequest,
  catalogRequest,
}: ActionOptions) => {
  actionsRegistry.register({
    name: 'get-entity-scorecard',
    title: 'Get Entity Scorecard',
    description: [
      'Returns a concise compliance scorecard for an entity, grouped by check category.',
      '',
      'For each category (e.g., Quality, Governance, Documentation) it shows:',
      '- Number of checks passed vs total applicable',
      '- Individual check results with pass/fail status and solution hints for failures',
      '- An overall score as a percentage of applicable checks passed',
      '',
      "Only applicable checks are included — checks that don't match the entity's",
      'kind/lifecycle/type/tags are excluded. Use get-entity-insights if you need',
      'details on which checks were skipped and why.',
      '',
      'For maturity rank (Stone/Bronze/Silver/Gold), use get-entity-maturity instead.',
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
          overallScore: z
            .string()
            .describe('Overall score as "passed/total (percentage%)"'),
          categories: z.array(
            z.object({
              name: z.string().describe('Category name'),
              score: z
                .string()
                .describe('Category score as "passed/total"'),
              checks: z.array(
                z.object({
                  name: z.string(),
                  description: z.string(),
                  result: z.enum(['PASS', 'FAIL', 'N/A']),
                  solution: z
                    .string()
                    .optional()
                    .describe('Suggested fix (only for failures)'),
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

      // 4. Group by category
      const categoryMap = new Map<
        string,
        Array<{
          name: string;
          description: string;
          result: 'PASS' | 'FAIL' | 'N/A';
          solution?: string;
        }>
      >();

      for (const check of applicable) {
        const category =
          (check.metadata?.category as string) ?? 'Uncategorized';
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
          description: check.description,
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

      // 5. Build scorecard
      const categories = Array.from(categoryMap.entries()).map(
        ([categoryName, checks]) => {
          const p = checks.filter(c => c.result === 'PASS').length;
          return {
            name: categoryName,
            score: `${p}/${checks.length}`,
            checks,
          };
        },
      );

      const totalPassed = checkResults.filter(
        r => r.result === true,
      ).length;
      const totalApplicable = applicable.length;
      const percentage =
        totalApplicable > 0
          ? Math.round((totalPassed / totalApplicable) * 100)
          : 100;

      const entityRef = stringifyEntityRef({ kind, namespace, name });

      return {
        output: {
          entity: entityRef,
          overallScore: `${totalPassed}/${totalApplicable} (${percentage}%)`,
          categories,
        },
      };
    },
  });
};
