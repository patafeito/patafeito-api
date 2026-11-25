import type { Difficulty } from '../../rewards/domain/rewards.js';

export type PetStats = { hunger: number; energy: number; happiness: number; statsUpdatedAt: Date };
/** Status com a espécie, que define a dificuldade de cuidado. Sem espécie, vale o médio. */
export type PetCareState = PetStats & { speciesId?: string | null };
export type StatsBoost = Partial<Record<'hunger' | 'energy' | 'happiness', number>>;

/**
 * Dificuldade de cuidado: cada pato pede um nível de atenção. Ela muda quão rápido os status caem
 * (`decay`), quanto cada cuidado rende (`gain`, aplicado a todo bônus positivo) e o peso das
 * penalidades de tarefa vencida e inatividade (`penalty`).
 * Do cheio, a saciedade zera em ~5 dias no fácil, ~3,5 dias no médio e ~2,3 dias no difícil.
 * Espelho em `patafeito-app/src/features/pet/domain/stats.ts`: mantenha os valores iguais.
 */
export type CareDifficulty = 'easy' | 'medium' | 'hard';
export type CareProfile = { decay: { hunger: number; energy: number; happiness: number }; gain: number; penalty: number };

export const CARE_PROFILES: Record<CareDifficulty, CareProfile> = {
  easy: { decay: { hunger: 0.8, energy: 0.6, happiness: 0.8 }, gain: 1.5, penalty: 0.5 },
  medium: { decay: { hunger: 1.2, energy: 0.9, happiness: 1.2 }, gain: 1.25, penalty: 0.75 },
  hard: { decay: { hunger: 1.8, energy: 1.3, happiness: 1.8 }, gain: 1, penalty: 1 },
};

/** Pingo é o pato de quem está começando; Bento pede rotina; Maré pede constância de foco. */
export const SPECIES_DIFFICULTY: Record<string, CareDifficulty> = { pingo: 'easy', bento: 'medium', mare: 'hard' };

export function careDifficulty(speciesId: string | null | undefined): CareDifficulty {
  return (speciesId && SPECIES_DIFFICULTY[speciesId]) || 'medium';
}

export function careProfile(speciesId: string | null | undefined): CareProfile {
  return CARE_PROFILES[careDifficulty(speciesId)];
}

/** Abaixo deste valor, fome ou energia aceleram a perda de felicidade. */
export const LOW_STAT_THRESHOLD = 30;
const LOW_STAT_PENALTY = 1.25;

export const FEED_COST_COINS = 5;
export const FEED_BOOST: StatsBoost = { hunger: 35, happiness: 2 };
export const FOCUS_BOOST: StatsBoost = { energy: 20, happiness: 4 };

/**
 * Mimar (Tela 6): tocar no pato (+5 no difícil, mais nos patos mais fáceis). É o único cuidado gratuito: alimentar e curar usam itens da mochila,
 * comprados na loja, para que as moedas tenham um só destino.
 */
export const PAMPER_BOOST: StatsBoost = { happiness: 5 };
export const PAMPER_COOLDOWN_MS = 3_600_000;

export function canPamper(lastPamperedAt: Date | null, now: Date) {
  return !lastPamperedAt || now.getTime() - lastPamperedAt.getTime() >= PAMPER_COOLDOWN_MS;
}

export function nextPamperAt(lastPamperedAt: Date) {
  return new Date(lastPamperedAt.getTime() + PAMPER_COOLDOWN_MS);
}
const taskHappiness: Record<Difficulty, number> = { easy: 6, medium: 10, hard: 15 };

export function taskBoost(difficulty: Difficulty): StatsBoost {
  return { happiness: taskHappiness[difficulty] };
}

const clamp = (value: number) => Math.max(0, Math.min(100, Math.round(value)));

/**
 * Aplica o tempo decorrido desde `statsUpdatedAt`. Função pura: o mesmo cálculo roda no app
 * para projetar as barras sem rede. A penalidade da felicidade usa os valores já decaídos,
 * uma aproximação suficiente para a cadência do jogo.
 */
export function decayStats(stats: PetCareState, now: Date): PetStats {
  const hours = (now.getTime() - stats.statsUpdatedAt.getTime()) / 3_600_000;
  if (hours <= 0) return { hunger: stats.hunger, energy: stats.energy, happiness: stats.happiness, statsUpdatedAt: stats.statsUpdatedAt };
  const { decay } = careProfile(stats.speciesId);
  const hunger = clamp(stats.hunger - decay.hunger * hours);
  const energy = clamp(stats.energy - decay.energy * hours);
  const penalty = (hunger < LOW_STAT_THRESHOLD ? LOW_STAT_PENALTY : 1) * (energy < LOW_STAT_THRESHOLD ? LOW_STAT_PENALTY : 1);
  const happiness = clamp(stats.happiness - decay.happiness * penalty * hours);
  return { hunger, energy, happiness, statsUpdatedAt: now };
}

/** Bônus como o pato o recebe: valores positivos rendem conforme a dificuldade; perdas passam iguais. */
export function scaleBoost(boost: StatsBoost, speciesId: string | null | undefined): StatsBoost {
  const { gain } = careProfile(speciesId);
  const scale = (value: number | undefined) => (value === undefined ? undefined : value > 0 ? Math.round(value * gain) : value);
  return { hunger: scale(boost.hunger), energy: scale(boost.energy), happiness: scale(boost.happiness) };
}

export function applyBoost(stats: PetStats, boost: StatsBoost, sign: 1 | -1 = 1): PetStats {
  return {
    hunger: clamp(stats.hunger + sign * (boost.hunger ?? 0)),
    energy: clamp(stats.energy + sign * (boost.energy ?? 0)),
    happiness: clamp(stats.happiness + sign * (boost.happiness ?? 0)),
    statsUpdatedAt: stats.statsUpdatedAt,
  };
}

/**
 * Status a gravar numa escrita do pet: decai até `now` e soma (ou estorna) o bônus já ajustado à
 * dificuldade do pato. O estorno usa a mesma escala, então desfaz exatamente o que foi somado.
 */
export function nextStats(pet: PetCareState, now: Date, boost: StatsBoost = {}, sign: 1 | -1 = 1): PetStats {
  return applyBoost(decayStats(pet, now), scaleBoost(boost, pet.speciesId), sign);
}

/** Perda de felicidade por penalidades (RN02, RN11), ajustada à dificuldade do pato. */
export function scaledPenalty(points: number, speciesId: string | null | undefined) {
  return Math.round(points * careProfile(speciesId).penalty);
}
