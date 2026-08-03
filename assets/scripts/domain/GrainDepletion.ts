export const GRAIN_DEPLETION_STAGE_IDS = [
    'supplied',
    'grain_exhausted',
    'vitality_deficit',
    'labored_step',
    'life_exhausted',
] as const;
export type GrainDepletionStageId = (typeof GRAIN_DEPLETION_STAGE_IDS)[number];

export interface GrainDepletionAdvance {
    readonly steps: number;
    readonly partyWiped: boolean;
}

export function advanceGrainDepletion(
    currentSteps: number,
    stepLimit: number,
): GrainDepletionAdvance | null {
    assertDepletionValues(currentSteps, stepLimit);
    if (currentSteps >= stepLimit) return null;
    const steps = currentSteps + 1;
    return { steps, partyWiped: steps >= stepLimit };
}

export function grainDepletionStage(
    remainingGrain: number,
    depletionSteps: number,
    stepLimit: number,
): GrainDepletionStageId {
    assertDepletionValues(depletionSteps, stepLimit);
    if (remainingGrain > 0) return 'supplied';
    if (depletionSteps <= 1) return 'grain_exhausted';
    const remainingSteps = Math.max(0, stepLimit - depletionSteps);
    if (remainingSteps >= 2) return 'vitality_deficit';
    if (remainingSteps === 1) return 'labored_step';
    return 'life_exhausted';
}

export function grainDepletionStepsRemaining(depletionSteps: number, stepLimit: number): number {
    assertDepletionValues(depletionSteps, stepLimit);
    return Math.max(0, stepLimit - depletionSteps);
}

function assertDepletionValues(depletionSteps: number, stepLimit: number): void {
    if (!Number.isSafeInteger(depletionSteps) || depletionSteps < 0) {
        throw new Error('断粮衰竭步数必须为非负安全整数');
    }
    if (!Number.isSafeInteger(stepLimit) || stepLimit < 1) {
        throw new Error('断粮衰竭上限必须为正安全整数');
    }
}
