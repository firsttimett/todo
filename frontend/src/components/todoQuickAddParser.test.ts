import { describe, expect, it } from 'vitest';

import { parseQuickAddInput } from './todoQuickAddParser';

describe('parseQuickAddInput', () => {
  const referenceDate = new Date('2026-04-03T09:00:00Z');

  it('extracts labels, priority, and tomorrow without losing the title', () => {
    expect(
      parseQuickAddInput(
        'Plan quarterly review tomorrow high #work',
        referenceDate,
      ),
    ).toEqual({
      title: 'Plan quarterly review',
      startDate: '2026-04-04',
      priority: 'high',
      labels: ['work'],
    });
  });

  it('recognizes named weekdays and p1 priority', () => {
    expect(
      parseQuickAddInput('Ship release notes friday p1 #launch', referenceDate),
    ).toEqual({
      title: 'Ship release notes',
      startDate: '2026-04-03',
      priority: 'high',
      labels: ['launch'],
    });
  });

  it('maps next week to next monday', () => {
    expect(parseQuickAddInput('Prep roadmap next week', referenceDate)).toEqual({
      title: 'Prep roadmap',
      startDate: '2026-04-06',
      priority: null,
      labels: [],
    });
  });

  it('leaves plain titles untouched', () => {
    expect(parseQuickAddInput('Write team update', referenceDate)).toEqual({
      title: 'Write team update',
      startDate: null,
      priority: null,
      labels: [],
    });
  });
});
