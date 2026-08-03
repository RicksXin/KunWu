import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
    grainDepletionStage,
    grainDepletionStepsRemaining,
} from 'db://assets/scripts/domain/GrainDepletion';

describe('断粮衰竭状态', () => {
    test('四步状态与顶部文案口径一致', () => {
        assert.deepEqual(
            [0, 1, 2, 3, 4].map((steps) => grainDepletionStage(0, steps, 4)),
            [
                'grain_exhausted',
                'grain_exhausted',
                'vitality_deficit',
                'labored_step',
                'life_exhausted',
            ],
        );
        assert.deepEqual(
            [0, 1, 2, 3, 4].map((steps) => grainDepletionStepsRemaining(steps, 4)),
            [4, 3, 2, 1, 0],
        );
    });

    test('补充灵粮后恢复为正常供给状态', () => {
        assert.equal(grainDepletionStage(1, 0, 4), 'supplied');
    });
});
