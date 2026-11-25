import { describe, expect, it } from 'vitest';
import { applyBoost, careDifficulty, decayStats, nextStats, scaleBoost, scaledPenalty, type PetCareState } from '../../src/modules/pets/domain/stats.js';

const start = new Date('2026-10-22T10:00:00.000Z');
/** Maré é o pato difícil: ganho 1x e o decaimento mais rápido, bom para conferir os valores-base. */
const full: PetCareState = { hunger: 100, energy: 100, happiness: 100, statsUpdatedAt: start, speciesId: 'mare' };
const hoursLater = (hours: number) => new Date(start.getTime() + hours * 3_600_000);

describe('dificuldade por pato', () => {
  it('Pingo é fácil, Bento médio, Maré difícil e espécie desconhecida vale médio', () => {
    expect(careDifficulty('pingo')).toBe('easy');
    expect(careDifficulty('bento')).toBe('medium');
    expect(careDifficulty('mare')).toBe('hard');
    expect(careDifficulty('outro')).toBe('medium');
    expect(careDifficulty(undefined)).toBe('medium');
  });

  it('patos mais fáceis perdem status mais devagar', () => {
    const after = (speciesId: string) => decayStats({ ...full, speciesId }, hoursLater(24)).hunger;
    expect(after('pingo')).toBeGreaterThan(after('bento'));
    expect(after('bento')).toBeGreaterThan(after('mare'));
  });

  it('nenhum pato zera a saciedade em menos de 2 dias, e o fácil aguenta 5', () => {
    expect(decayStats(full, hoursLater(48)).hunger).toBeGreaterThan(0);
    expect(decayStats({ ...full, speciesId: 'pingo' }, hoursLater(120)).hunger).toBeGreaterThanOrEqual(0);
    expect(decayStats({ ...full, speciesId: 'pingo' }, hoursLater(110)).hunger).toBeGreaterThan(0);
  });

  it('cuidados rendem mais nos patos fáceis, e perdas não são ampliadas', () => {
    expect(scaleBoost({ hunger: 20, happiness: 5 }, 'pingo')).toEqual({ hunger: 30, happiness: 8, energy: undefined });
    expect(scaleBoost({ hunger: 20 }, 'mare')).toMatchObject({ hunger: 20 });
    expect(scaleBoost({ happiness: -10 }, 'pingo')).toMatchObject({ happiness: -10 });
  });

  it('penalidades pesam menos nos patos fáceis', () => {
    expect(scaledPenalty(10, 'pingo')).toBe(5);
    expect(scaledPenalty(10, 'bento')).toBe(8);
    expect(scaledPenalty(10, 'mare')).toBe(10);
  });
});

describe('decayStats', () => {
  it('perde pontos proporcionais às horas decorridas', () => {
    expect(decayStats(full, hoursLater(10))).toEqual({ hunger: 82, energy: 87, happiness: 82, statsUpdatedAt: hoursLater(10) });
  });

  it('não altera nada quando o relógio não avançou', () => {
    expect(decayStats(full, start)).toEqual({ hunger: 100, energy: 100, happiness: 100, statsUpdatedAt: start });
    expect(decayStats(full, hoursLater(-1))).toEqual({ hunger: 100, energy: 100, happiness: 100, statsUpdatedAt: start });
  });

  it('nunca passa de zero', () => {
    expect(decayStats(full, hoursLater(500))).toMatchObject({ hunger: 0, energy: 0, happiness: 0 });
  });

  it('acelera a perda de felicidade quando a fome está baixa', () => {
    const hungry = { ...full, hunger: 20 };
    expect(decayStats(hungry, hoursLater(10)).happiness).toBe(78);
    expect(decayStats(full, hoursLater(10)).happiness).toBe(82);
  });
});

describe('applyBoost', () => {
  it('soma e limita a 100', () => {
    expect(applyBoost({ ...full, hunger: 80 }, { hunger: 35, happiness: 2 })).toMatchObject({ hunger: 100, happiness: 100 });
  });

  it('estorna sem ficar negativo', () => {
    expect(applyBoost({ ...full, happiness: 4 }, { happiness: 12 }, -1).happiness).toBe(0);
  });
});

describe('nextStats', () => {
  it('decai até agora antes de aplicar o bônus e avança o relógio', () => {
    expect(nextStats(full, hoursLater(10), { hunger: 35 })).toEqual({ hunger: 100, energy: 87, happiness: 82, statsUpdatedAt: hoursLater(10) });
  });

  it('o estorno desfaz exatamente o bônus ajustado à dificuldade', () => {
    const pingo = { ...full, happiness: 50, speciesId: 'pingo' };
    const boosted = { ...nextStats(pingo, start, { happiness: 10 }), speciesId: 'pingo' };
    expect(boosted.happiness).toBe(65);
    expect(nextStats(boosted, start, { happiness: 10 }, -1).happiness).toBe(50);
  });
});
