import { InputError } from '@backstage/errors';
import { stringifyEntityRef } from '@backstage/catalog-model';
import { matchesFilter, getFilterMismatchReasons } from '../helpers';
import { ActionOptions, TechInsightsCheck } from './types';

export const createGetEntityInsightsAction = ({
  actionsRegistry,
  tiRequest,
  catalogRequest,
}: ActionOptions) => {
  actionsRegistry.register({
    name: 'get-entity-insights',
    title: 'Get Entity Tech Insights Report',
    description: [
      'Provides a comprehensive tech-insights report for a specific entity.',
      '',
      'Returns:',
      '- Entity metadata (kind, lifecycle, type, tags)',
      '- Summary counts (total, applicable, skipped, passed, failed)',
      '- Applicable checks with their pass/fail results and evaluated facts',
      '- Skipped checks with human-readable explanations of WHY each was skipped',
      '- Latest facts collected for the entity',
      '',
      'Use this action when:',
      "- You want to understand an entity's overall compliance posture",
      '- run-checks returned empty results and you need to understand why',
      "- You want to see which checks apply to an entity and which don't",
      '',
      'Example: For a Component with lifecycle "deprecated", checks filtered to',
      '"production" lifecycle will appear in skippedChecks with an explanation.',
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
          entity: z.object({
            kind: z.string(),
            namespace: z.string(),
            name: z.string(),
            lifecycle: z.string().optional(),
            type: z.string().optional(),
            tags: z.array(z.string()).optional(),
          }),
          summary: z.object({
            totalChecks: z
              .number()
              .describe('Total number of configured checks'),
            applicableChecks: z
              .number()
              .describe('Checks that apply to this entity'),
            skippedChecks: z
              .number()
              .describe('Checks skipped due to filter mismatch'),
            passed: z.number().describe('Applicable checks that passed'),
            failed: z.number().describe('Applicable checks that failed'),
          }),
          applicableChecks: z.array(
            z.object({
              id: z.string(),
              name: z.string(),
              description: z.string(),
              category: z.string().optional(),
              result: z
                .boolean()
                .nullable()
                .describe(
                  'true=passed, false=failed, null=could not evaluate',
                ),
              facts: z.record(z.unknown()).optional(),
            }),
          ),
          skippedChecks: z.array(
            z.object({
              id: z.string(),
              name: z.string(),
              description: z.string(),
              reasons: z
                .array(z.string())
                .describe('Why this check does not apply'),
              filter: z
                .unknown()
                .describe('The filter that did not match'),
            }),
          ),
          latestFacts: z
            .record(z.unknown())
            .describe('Latest facts collected for the entity'),
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

      // 2. Get all checks
      const allChecks: TechInsightsCheck[] = await tiRequest('/checks');

      // 3. Categorize checks as applicable or skipped
      const applicable: TechInsightsCheck[] = [];
      const skipped: Array<{
        id: string;
        name: string;
        description: string;
        reasons: string[];
        filter: unknown;
      }> = [];

      for (const check of allChecks) {
        if (!check.filter) {
          applicable.push(check);
        } else if (matchesFilter(catalogEntity, check.filter)) {
          applicable.push(check);
        } else {
          skipped.push({
            id: check.id,
            name: check.name,
            description: check.description,
            reasons: getFilterMismatchReasons(catalogEntity, check.filter),
            filter: check.filter,
          });
        }
      }

      // 4. Run applicable checks
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

      // 5. Fetch latest facts
      const allFactIds = [
        ...new Set(applicable.flatMap(c => c.factIds)),
      ];
      let latestFacts: Record<string, unknown> = {};
      if (allFactIds.length > 0) {
        const entityRef = stringifyEntityRef({ kind, namespace, name });
        const params = new URLSearchParams();
        params.append('entity', entityRef);
        for (const id of allFactIds) {
          params.append('ids[]', id);
        }
        try {
          const factsResponse = await tiRequest(
            `/facts/latest?${params.toString()}`,
          );
          latestFacts = factsResponse?.facts ?? factsResponse ?? {};
        } catch {
          latestFacts = {};
        }
      }

      // 6. Assemble response
      const applicableResults = applicable.map(check => {
        const r = resultMap.get(check.id);
        return {
          id: check.id,
          name: check.name,
          description: check.description,
          category: check.metadata?.category as string | undefined,
          result: r ? (r.result as boolean) : null,
          facts: r?.facts,
        };
      });

      const passed = applicableResults.filter(
        r => r.result === true,
      ).length;
      const failed = applicableResults.filter(
        r => r.result === false,
      ).length;

      return {
        output: {
          entity: {
            kind: catalogEntity.kind,
            namespace: catalogEntity.metadata?.namespace ?? namespace,
            name: catalogEntity.metadata?.name ?? name,
            lifecycle: catalogEntity.spec?.lifecycle,
            type: catalogEntity.spec?.type,
            tags: catalogEntity.metadata?.tags,
          },
          summary: {
            totalChecks: allChecks.length,
            applicableChecks: applicable.length,
            skippedChecks: skipped.length,
            passed,
            failed,
          },
          applicableChecks: applicableResults,
          skippedChecks: skipped,
          latestFacts,
        },
      };
    },
  });
};
