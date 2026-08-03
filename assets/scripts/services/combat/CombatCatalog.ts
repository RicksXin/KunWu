import { ATTRIBUTE_KEYS, createAttributes } from 'db://assets/scripts/domain/Attributes';
import type { Attributes, AttributeKey, MutableAttributes } from 'db://assets/scripts/domain/Attributes';
import {
    BUFF_KINDS,
    CONTROL_KINDS,
    DEBUFF_KINDS,
} from 'db://assets/scripts/domain/CombatState';
import type { SkillRuntime, StatusKind } from 'db://assets/scripts/domain/CombatState';
import type { DamageKind } from 'db://assets/scripts/domain/CombatTypes';
import { SKILL_TARGET_TYPES } from 'db://assets/scripts/domain/SkillTargeting';
import type { SkillTargetType } from 'db://assets/scripts/domain/SkillTargeting';

export interface CombatCatalogSkill {
    readonly nameKey: string;
    readonly runtime: SkillRuntime;
}

export interface CombatEnemyDefinition {
    readonly id: string;
    readonly nameKey: string;
    readonly raceKey: string;
    readonly maxHp: number;
    readonly attributes: Attributes;
    readonly skillIds: readonly string[];
    readonly initialActionTimer: number;
}

export interface CombatLootDefinition {
    readonly itemId: string;
    readonly nameKey: string;
    readonly amount: number;
}

export interface CombatEncounterDefinition {
    readonly id: string;
    readonly enemies: readonly CombatEnemyDefinition[];
    readonly loot: readonly CombatLootDefinition[];
    readonly soulCrystalReward: number;
    readonly escapeEnemyHpPercent: number;
}

export interface CombatCatalog {
    readonly defenseLevelConstant: number;
    readonly partyInitialActionTimers: readonly number[];
    readonly skills: ReadonlyMap<string, CombatCatalogSkill>;
    readonly encounters: ReadonlyMap<string, CombatEncounterDefinition>;
}

/** shared/combat_d0.json 的严格解析入口。 */
export function parseCombatCatalog(raw: unknown): CombatCatalog {
    const root = recordOf(raw, 'combat_d0');
    const skills = arrayOf(root.skills, 'combat_d0.skills').map(parseSkill);
    const skillMap = new Map(skills.map((skill) => [skill.runtime.skillId, skill]));
    const encounters = arrayOf(root.encounters, 'combat_d0.encounters')
        .map((value, index) => parseEncounter(value, index, skillMap));
    return {
        defenseLevelConstant: positiveInt(root.defenseLevelConstant, 'defenseLevelConstant'),
        partyInitialActionTimers: arrayOf(
            root.partyInitialActionTimers,
            'partyInitialActionTimers',
        ).map((value, index) => positiveInt(value, `partyInitialActionTimers[${index}]`)),
        skills: skillMap,
        encounters: new Map(encounters.map((encounter) => [encounter.id, encounter])),
    };
}

function parseSkill(raw: unknown, index: number): CombatCatalogSkill {
    const row = recordOf(raw, `skills[${index}]`);
    const id = stringOf(row.id, `skills[${index}].id`);
    const damageKind = oneOf(row.damageKind, ['physical', 'magical', 'none'] as const, `${id}.damageKind`);
    const targetType = oneOf(row.targetType, SKILL_TARGET_TYPES, `${id}.targetType`);
    const primaryAttribute = oneOf(
        row.primaryAttribute,
        ATTRIBUTE_KEYS,
        `${id}.primaryAttribute`,
    );
    const status = row.appliesStatus === undefined
        ? undefined
        : parseStatus(row.appliesStatus, id);
    const runtime: SkillRuntime = {
        skillId: id,
        damageKind: damageKind as DamageKind,
        targetType: targetType as SkillTargetType,
        ignoreTaunt: booleanOf(row.ignoreTaunt, `${id}.ignoreTaunt`),
        baseIntervalTicks: positiveInt(row.baseIntervalTicks, `${id}.baseIntervalTicks`),
        cooldownTicks: nonNegativeInt(row.cooldownTicks, `${id}.cooldownTicks`),
        primaryAttribute: primaryAttribute as AttributeKey,
        primaryPercent: nonNegativeInt(row.primaryPercent, `${id}.primaryPercent`),
        secondaryAttribute: optionalAttribute(row.secondaryAttribute, `${id}.secondaryAttribute`),
        secondaryPercent: optionalNonNegativeInt(row.secondaryPercent, `${id}.secondaryPercent`),
        appliesStatus: status,
    };
    return { nameKey: stringOf(row.nameKey, `${id}.nameKey`), runtime };
}

function parseStatus(raw: unknown, skillId: string): SkillRuntime['appliesStatus'] {
    const row = recordOf(raw, `${skillId}.appliesStatus`);
    const kinds = [...BUFF_KINDS, ...DEBUFF_KINDS, ...CONTROL_KINDS] as readonly StatusKind[];
    return {
        kind: oneOf(row.kind, kinds, `${skillId}.appliesStatus.kind`),
        durationTicks: positiveInt(row.durationTicks, `${skillId}.appliesStatus.durationTicks`),
        magnitude: nonNegativeInt(row.magnitude, `${skillId}.appliesStatus.magnitude`),
    };
}

function parseEncounter(
    raw: unknown,
    index: number,
    skills: ReadonlyMap<string, CombatCatalogSkill>,
): CombatEncounterDefinition {
    const row = recordOf(raw, `encounters[${index}]`);
    const id = stringOf(row.id, `encounters[${index}].id`);
    const enemies = arrayOf(row.enemies, `${id}.enemies`)
        .map((enemy, enemyIndex) => parseEnemy(enemy, `${id}.enemies[${enemyIndex}]`, skills));
    if (enemies.length === 0) throw new Error(`战斗配置 ${id} 至少需要一个敌方单位`);
    return {
        id,
        enemies,
        loot: arrayOf(row.loot ?? [], `${id}.loot`).map((loot, lootIndex) => {
            const item = recordOf(loot, `${id}.loot[${lootIndex}]`);
            return {
                itemId: stringOf(item.itemId, `${id}.loot[${lootIndex}].itemId`),
                nameKey: stringOf(item.nameKey, `${id}.loot[${lootIndex}].nameKey`),
                amount: positiveInt(item.amount, `${id}.loot[${lootIndex}].amount`),
            };
        }),
        soulCrystalReward: nonNegativeInt(row.soulCrystalReward, `${id}.soulCrystalReward`),
        escapeEnemyHpPercent: percentOf(row.escapeEnemyHpPercent, `${id}.escapeEnemyHpPercent`),
    };
}

function parseEnemy(
    raw: unknown,
    path: string,
    skills: ReadonlyMap<string, CombatCatalogSkill>,
): CombatEnemyDefinition {
    const row = recordOf(raw, path);
    const skillIds = arrayOf(row.skillIds, `${path}.skillIds`)
        .map((value, index) => stringOf(value, `${path}.skillIds[${index}]`));
    for (const skillId of skillIds) {
        if (!skills.has(skillId)) throw new Error(`${path} 引用了不存在的技能 ${skillId}`);
    }
    const attributesRaw = recordOf(row.attributes, `${path}.attributes`);
    const values = {} as MutableAttributes;
    ATTRIBUTE_KEYS.forEach((key) => {
        values[key] = nonNegativeInt(attributesRaw[key], `${path}.attributes.${key}`);
    });
    return {
        id: stringOf(row.id, `${path}.id`),
        nameKey: stringOf(row.nameKey, `${path}.nameKey`),
        raceKey: stringOf(row.raceKey, `${path}.raceKey`),
        maxHp: positiveInt(row.maxHp, `${path}.maxHp`),
        attributes: createAttributes(values),
        skillIds,
        initialActionTimer: positiveInt(row.initialActionTimer, `${path}.initialActionTimer`),
    };
}

function recordOf(value: unknown, path: string): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error(`${path} 必须是对象`);
    }
    return value as Record<string, unknown>;
}

function arrayOf(value: unknown, path: string): readonly unknown[] {
    if (!Array.isArray(value)) throw new Error(`${path} 必须是数组`);
    return value;
}

function stringOf(value: unknown, path: string): string {
    if (typeof value !== 'string' || value.length === 0) throw new Error(`${path} 必须是非空字符串`);
    return value;
}

function booleanOf(value: unknown, path: string): boolean {
    if (typeof value !== 'boolean') throw new Error(`${path} 必须是布尔值`);
    return value;
}

function positiveInt(value: unknown, path: string): number {
    if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0) {
        throw new Error(`${path} 必须是正整数`);
    }
    return value;
}

function nonNegativeInt(value: unknown, path: string): number {
    if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
        throw new Error(`${path} 必须是非负整数`);
    }
    return value;
}

function percentOf(value: unknown, path: string): number {
    const parsed = nonNegativeInt(value, path);
    if (parsed > 100) throw new Error(`${path} 必须在 0–100 之间`);
    return parsed;
}

function optionalAttribute(value: unknown, path: string): AttributeKey | undefined {
    return value === undefined ? undefined : oneOf(value, ATTRIBUTE_KEYS, path);
}

function optionalNonNegativeInt(value: unknown, path: string): number | undefined {
    return value === undefined ? undefined : nonNegativeInt(value, path);
}

function oneOf<T extends string>(value: unknown, values: readonly T[], path: string): T {
    if (typeof value !== 'string' || !(values as readonly string[]).includes(value)) {
        throw new Error(`${path} 取值非法：${String(value)}`);
    }
    return value as T;
}
