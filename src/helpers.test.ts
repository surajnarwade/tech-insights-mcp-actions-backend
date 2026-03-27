import {
  compareValues,
  matchesSingleFilter,
  matchesFilter,
  getFilterMismatchReasons,
} from './helpers';

describe('compareValues', () => {
  it('matches identical strings case-insensitively', () => {
    expect(compareValues('Component', 'component')).toBe(true);
    expect(compareValues('production', 'Production')).toBe(true);
  });

  it('returns false for non-matching strings', () => {
    expect(compareValues('production', 'experimental')).toBe(false);
  });

  it('matches identical non-string values', () => {
    expect(compareValues(true, true)).toBe(true);
    expect(compareValues(42, 42)).toBe(true);
  });

  it('returns false for non-matching non-string values', () => {
    expect(compareValues(true, false)).toBe(false);
    expect(compareValues(1, 2)).toBe(false);
  });

  it('matches if entity value is an array containing the filter value', () => {
    expect(compareValues(['frontend', 'public'], 'frontend')).toBe(true);
    expect(compareValues(['frontend', 'public'], 'backend')).toBe(false);
  });

  it('handles undefined and null entity values', () => {
    expect(compareValues(undefined, 'production')).toBe(false);
    expect(compareValues(null, 'production')).toBe(false);
  });
});

describe('matchesSingleFilter', () => {
  const entity = {
    kind: 'Component',
    metadata: {
      name: 'my-service',
      tags: ['frontend', 'public'],
    },
    spec: {
      type: 'service',
      lifecycle: 'production',
    },
  };

  it('matches a simple kind filter', () => {
    expect(matchesSingleFilter(entity, { kind: 'Component' })).toBe(true);
    expect(matchesSingleFilter(entity, { kind: 'API' })).toBe(false);
  });

  it('matches dot-notation filters', () => {
    expect(matchesSingleFilter(entity, { 'spec.lifecycle': 'production' })).toBe(true);
    expect(matchesSingleFilter(entity, { 'spec.lifecycle': 'experimental' })).toBe(false);
  });

  it('applies AND logic within a filter', () => {
    expect(
      matchesSingleFilter(entity, {
        kind: 'Component',
        'spec.lifecycle': 'production',
      }),
    ).toBe(true);
    expect(
      matchesSingleFilter(entity, {
        kind: 'Component',
        'spec.lifecycle': 'experimental',
      }),
    ).toBe(false);
  });

  it('matches array filter values with OR logic', () => {
    expect(
      matchesSingleFilter(entity, {
        'spec.lifecycle': ['production', 'experimental'],
      }),
    ).toBe(true);
    expect(
      matchesSingleFilter(entity, {
        'spec.lifecycle': ['deprecated', 'experimental'],
      }),
    ).toBe(false);
  });

  it('matches entity array properties (tags)', () => {
    expect(
      matchesSingleFilter(entity, { 'metadata.tags': 'frontend' }),
    ).toBe(true);
    expect(
      matchesSingleFilter(entity, { 'metadata.tags': 'backend' }),
    ).toBe(false);
  });

  it('returns true for empty filter', () => {
    expect(matchesSingleFilter(entity, {})).toBe(true);
  });

  it('returns false when entity property is missing', () => {
    expect(
      matchesSingleFilter(entity, { 'spec.owner': 'team-a' }),
    ).toBe(false);
  });
});

describe('matchesFilter', () => {
  const entity = {
    kind: 'Component',
    spec: { lifecycle: 'deprecated', type: 'service' },
    metadata: { tags: ['internal'] },
  };

  it('matches a single filter object', () => {
    expect(matchesFilter(entity, { kind: 'Component' })).toBe(true);
  });

  it('applies OR logic across multiple filter objects', () => {
    expect(
      matchesFilter(entity, [
        { 'spec.lifecycle': 'production' },
        { 'spec.lifecycle': 'deprecated' },
      ]),
    ).toBe(true);
  });

  it('returns false when no filter objects match', () => {
    expect(
      matchesFilter(entity, [
        { 'spec.lifecycle': 'production' },
        { 'spec.lifecycle': 'experimental' },
      ]),
    ).toBe(false);
  });

  it('handles production filter against deprecated entity', () => {
    expect(
      matchesFilter(entity, {
        kind: 'Component',
        'spec.lifecycle': 'production',
      }),
    ).toBe(false);
  });
});

describe('getFilterMismatchReasons', () => {
  const entity = {
    kind: 'Component',
    spec: { lifecycle: 'deprecated', type: 'service' },
    metadata: { name: 'test', tags: ['internal'] },
  };

  it('explains missing property', () => {
    const reasons = getFilterMismatchReasons(entity, {
      'spec.owner': 'team-a',
    });
    expect(reasons).toHaveLength(1);
    expect(reasons[0]).toContain("'spec.owner'");
    expect(reasons[0]).toContain('no value');
  });

  it('explains value mismatch', () => {
    const reasons = getFilterMismatchReasons(entity, {
      'spec.lifecycle': 'production',
    });
    expect(reasons).toHaveLength(1);
    expect(reasons[0]).toContain("'production'");
    expect(reasons[0]).toContain("'deprecated'");
  });

  it('explains array filter mismatch', () => {
    const reasons = getFilterMismatchReasons(entity, {
      'spec.lifecycle': ['production', 'experimental'],
    });
    expect(reasons).toHaveLength(1);
    expect(reasons[0]).toContain('production, experimental');
    expect(reasons[0]).toContain('deprecated');
  });

  it('does not report matching fields', () => {
    const reasons = getFilterMismatchReasons(entity, {
      kind: 'Component',
      'spec.lifecycle': 'production',
    });
    // Only lifecycle mismatches, kind matches
    expect(reasons).toHaveLength(1);
    expect(reasons[0]).toContain('spec.lifecycle');
  });

  it('handles multiple filter objects', () => {
    const reasons = getFilterMismatchReasons(entity, [
      { 'spec.lifecycle': 'production' },
      { 'spec.type': 'website' },
    ]);
    expect(reasons).toHaveLength(2);
  });

  it('returns empty array when filter matches', () => {
    const reasons = getFilterMismatchReasons(entity, {
      kind: 'Component',
    });
    expect(reasons).toHaveLength(0);
  });
});
