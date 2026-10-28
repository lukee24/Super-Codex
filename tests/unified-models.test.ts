import { describe, expect, it } from 'vitest';
import { getUnifiedModelOptions, matchesModelSelection, normalizeModelName } from '../src/components/ModelControls';

describe('unified visible model catalog', () => {
  it('contains every concept and historical name once, with newer versions above older ones', () => {
    const models = getUnifiedModelOptions();
    expect(models).toHaveLength(21);
    expect(new Set(models.map(model => normalizeModelName(model.name))).size).toBe(models.length);
    expect(models.filter(model => model.conceptId)).toHaveLength(16);
    expect(models[0].name).toBe('GPT-10 Apex');
    expect(models.at(-1)?.name).toBe('GPT-5.6 Luna');
    const versions = models.map(model => Number(model.name.match(/GPT-(\d+(?:\.\d+)?)/)?.[1]));
    expect(versions).toEqual([...versions].sort((a, b) => b - a));
    expect(models.filter(model => model.name === 'GPT-6 Astra')).toHaveLength(1);
    expect(models.filter(model => model.name === 'GPT-6.1 Sol')).toHaveLength(1);
    expect(models.filter(model => model.name === 'GPT-6.1 Terra')).toHaveLength(1);
    expect(models.every(model => model.officialId === undefined)).toBe(true);
  });

  it('merges only returned official IDs while preserving concept and reference aliases', () => {
    const models = getUnifiedModelOptions([
      { id: 'real-astra', name: 'GPT-6.0 Astra' },
      { id: 'real-sol', name: 'GPT-6.1 Sol' },
      { id: 'duplicate-astra', name: 'GPT-6 Astra' },
    ]);
    expect(models).toHaveLength(21);
    const astra = models.find(model => model.conceptId === 'astra')!;
    expect(astra).toMatchObject({ key: 'official:real-astra', name: 'GPT-6 Astra', conceptId: 'astra', referenceName: 'GPT-6 Astra', officialId: 'real-astra' });
    expect(matchesModelSelection(astra, 'concept:astra')).toBe(true);
    expect(matchesModelSelection(astra, 'reference:GPT-6 Astra')).toBe(true);
    expect(matchesModelSelection(astra, 'official:real-astra')).toBe(true);
    expect(matchesModelSelection(astra, 'official:duplicate-astra')).toBe(false);
    expect(models.find(model => model.conceptId === 'apex')?.officialId).toBeUndefined();
  });
});
