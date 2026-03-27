import { ActionOptions } from './types';
import { createGetChecksAction } from './createGetChecksAction';
import { createRunChecksAction } from './createRunChecksAction';
import { createGetEntityInsightsAction } from './createGetEntityInsightsAction';
import { createGetEntityScorecardAction } from './createGetEntityScorecardAction';
import { createGetEntityMaturityAction } from './createGetEntityMaturityAction';
import { createGetFactSchemasAction } from './createGetFactSchemasAction';
import { createGetLatestFactsAction } from './createGetLatestFactsAction';
import { createGetFactsRangeAction } from './createGetFactsRangeAction';

export const createTechInsightsActions = (options: ActionOptions) => {
  createGetChecksAction(options);
  createRunChecksAction(options);
  createGetEntityInsightsAction(options);
  createGetEntityScorecardAction(options);
  createGetEntityMaturityAction(options);
  createGetFactSchemasAction(options);
  createGetLatestFactsAction(options);
  createGetFactsRangeAction(options);
};
