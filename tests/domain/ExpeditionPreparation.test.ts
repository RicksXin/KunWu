import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
    loadoutWeight,
    parseExpeditionPreparationConfig,
    partyBurdenLimit,
    settleNaturalStamina,
    validateExpeditionReadiness,
} from 'db://assets/scripts/domain/ExpeditionPreparation';
import type {
    ExpeditionHeroSnapshot,
    ExpeditionPreparationConfig,
} from 'db://assets/scripts/domain/ExpeditionPreparation';

const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..');
const raw = JSON.parse(
    readFileSync(
        path.join(REPO_ROOT, 'assets/bundles/shared/expedition_preparation.json'),
        'utf8',
    ),
) as { expedition_preparation: unknown };
const CONFIG: ExpeditionPreparationConfig = parseExpeditionPreparationConfig(
    raw.expedition_preparation,
);

const HEROES: readonly ExpeditionHeroSnapshot[] = [
    {
        instanceId: 'h1',
        isDead: false,
        stamina: 100,
        attributes: {
            strength: 10,
            magic: 0,
            technique: 0,
            speed: 0,
            constitution: 8,
            armor: 0,
            resistance: 0,
        },
    },
    {
        instanceId: 'h2',
        isDead: false,
        stamina: 5,
        attributes: {
            strength: 4,
            magic: 0,
            technique: 0,
            speed: 0,
            constitution: 6,
            armor: 0,
            resistance: 0,
        },
    },
];

describe('入山整备配置', () => {
    test('三种携带物与五张地图齐全', () => {
        assert.deepEqual(Object.keys(CONFIG.items).sort(), ['lens', 'pickaxe', 'spiritGrain']);
        assert.equal(CONFIG.maps.length, 5);
        assert.equal(CONFIG.staminaMax, 100);
        assert.equal(CONFIG.partyUnlockCosts[0], 0);
    });
});

describe('灵息自然恢复', () => {
    test('营地中只结算完整周期并钳制到 100', () => {
        const result = settleNaturalStamina({
            heroes: [
                { instanceId: 'h1', stamina: 99 },
                { instanceId: 'h2', stamina: 80 },
            ],
            lastSettledAtUtc: 1_000,
            nowUtcSeconds: 1_000 + CONFIG.staminaRecoveryIntervalSeconds * 2 + 1,
            isInExpedition: false,
            config: CONFIG,
        });
        assert.equal(result.staminaByHero.h1, 100);
        assert.equal(result.staminaByHero.h2, 82);
        assert.equal(
            result.nextSettledAtUtc,
            1_000 + CONFIG.staminaRecoveryIntervalSeconds * 2,
        );
    });

    test('野外地图中不恢复', () => {
        const result = settleNaturalStamina({
            heroes: [{ instanceId: 'h1', stamina: 20 }],
            lastSettledAtUtc: 1_000,
            nowUtcSeconds: 99_000,
            isInExpedition: true,
            config: CONFIG,
        });
        assert.equal(result.staminaByHero.h1, 20);
        assert.equal(result.changed, false);
    });
});

describe('负重与入山门槛', () => {
    test('灵粮、开山镐和探灵镜都计入负重', () => {
        assert.equal(
            loadoutWeight({ spiritGrain: 20, pickaxe: 2, lens: 1 }, CONFIG),
            20 + CONFIG.items.pickaxe.weight * 2 + CONFIG.items.lens.weight,
        );
    });

    test('队伍负重由基础值、力道与肉身共同决定', () => {
        assert.equal(
            partyBurdenLimit(['h1', 'h2', null, null], HEROES, CONFIG),
            CONFIG.baseBurden +
                14 * CONFIG.strengthBurdenFactor +
                14 * CONFIG.constitutionBurdenFactor,
        );
    });

    test('任一上阵修士灵息不足时拒绝地图', () => {
        const map = CONFIG.maps[0]!;
        const result = validateExpeditionReadiness({
            slots: ['h1', 'h2', null, null],
            heroes: HEROES,
            loadout: { spiritGrain: map.minimumCarriedGrain, pickaxe: 0, lens: 0 },
            map,
            config: CONFIG,
        });
        assert.equal(result.isReady, false);
        assert.ok(result.problems.some((problem) => /灵息不足/.test(problem)));
    });

    test('存活队伍、灵息、灵粮和负重均满足时通过', () => {
        const map = CONFIG.maps[0]!;
        const result = validateExpeditionReadiness({
            slots: ['h1', null, null, null],
            heroes: HEROES,
            loadout: { spiritGrain: map.minimumCarriedGrain, pickaxe: 0, lens: 0 },
            map,
            config: CONFIG,
        });
        assert.equal(result.isReady, true);
    });
});
