import {
  AuthService,
  DiscoveryService,
} from '@backstage/backend-plugin-api';
import {
  InputError,
  NotAllowedError,
  NotFoundError,
} from '@backstage/errors';
import get from 'lodash/get';

/**
 * Makes an authenticated HTTP request to a Backstage backend plugin API.
 */
export async function makeRequest(
  discovery: DiscoveryService,
  auth: AuthService,
  targetPluginId: string,
  path: string,
  options?: { method?: string; body?: unknown },
): Promise<any> {
  const baseUrl = await discovery.getBaseUrl(targetPluginId);
  const { token } = await auth.getPluginRequestToken({
    onBehalfOf: await auth.getOwnServiceCredentials(),
    targetPluginId,
  });

  const response = await fetch(`${baseUrl}${path}`, {
    method: options?.method ?? 'GET',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    ...(options?.body ? { body: JSON.stringify(options.body) } : {}),
  });

  if (!response.ok) {
    const text = await response.text();
    if (response.status === 404) {
      throw new NotFoundError(
        `${targetPluginId} API returned 404: ${text}`,
      );
    }
    if (response.status === 403) {
      throw new NotAllowedError(
        `${targetPluginId} API returned 403: ${text}`,
      );
    }
    if (response.status >= 400 && response.status < 500) {
      throw new InputError(
        `${targetPluginId} API returned ${response.status}: ${text}`,
      );
    }
    throw new Error(
      `${targetPluginId} API returned ${response.status}: ${text}`,
    );
  }

  return response.json();
}

/**
 * Compares two values with case-insensitive string matching.
 * If the entity value is an array, checks if any element matches.
 */
export function compareValues(
  entityValue: unknown,
  filterValue: unknown,
): boolean {
  if (Array.isArray(entityValue)) {
    return entityValue.some(ev => compareValues(ev, filterValue));
  }
  if (typeof entityValue === 'string' && typeof filterValue === 'string') {
    return entityValue.toLowerCase() === filterValue.toLowerCase();
  }
  return entityValue === filterValue;
}

/**
 * Checks if an entity matches a single filter object.
 * All key-value pairs in the filter must match (AND logic).
 */
export function matchesSingleFilter(
  entity: Record<string, unknown>,
  filter: Record<string, unknown>,
): boolean {
  return Object.entries(filter).every(([key, value]) => {
    const entityValue = get(entity, key);
    if (Array.isArray(value)) {
      return value.some(v => compareValues(entityValue, v));
    }
    return compareValues(entityValue, value);
  });
}

/**
 * Checks if an entity matches a check's filter.
 *
 * Replicates the server-side JsonRulesEngineFactChecker filter matching:
 * - Single filter object: all keys must match (AND)
 * - Array of filter objects: any one must match (OR)
 * - Array filter values: any value must match (OR)
 * - String comparison is case-insensitive
 * - Uses lodash.get for dot-notation property access
 */
export function matchesFilter(
  entity: Record<string, unknown>,
  filter:
    | Record<string, unknown>
    | Record<string, unknown>[],
): boolean {
  const filters = Array.isArray(filter) ? filter : [filter];
  return filters.some(f => matchesSingleFilter(entity, f));
}

/**
 * Returns human-readable reasons explaining why an entity doesn't match a filter.
 */
export function getFilterMismatchReasons(
  entity: Record<string, unknown>,
  filter:
    | Record<string, unknown>
    | Record<string, unknown>[],
): string[] {
  const filters = Array.isArray(filter) ? filter : [filter];
  const reasons: string[] = [];

  for (const f of filters) {
    for (const [key, value] of Object.entries(f)) {
      const entityValue = get(entity, key);
      const expected = Array.isArray(value) ? value.join(', ') : String(value);

      if (entityValue === undefined || entityValue === null) {
        reasons.push(
          `Requires '${key}' to be '${expected}' but entity has no value for '${key}'`,
        );
      } else if (!compareValues(entityValue, value as unknown)) {
        const actual = Array.isArray(entityValue)
          ? entityValue.join(', ')
          : String(entityValue);
        reasons.push(
          `Requires '${key}' to be '${expected}' but entity has '${actual}'`,
        );
      }
    }
  }

  return reasons;
}
