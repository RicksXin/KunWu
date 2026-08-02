import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import {
    instantiateHero,
    toCombatUnit,
    toSkillRuntime,
    buildSkillTable,
} from 'db://assets/scripts/domain/HeroFactory';
import type {
    CareerData,
    SkillData,
    HeroData,
    HeroBalanceContext,
} from 'db://assets/scripts/domain/HeroFactory';
import { parseBalanceTables } from 'db://assets/scripts/domain/BalanceTables';
import { ATTRIBUTE_KEYS } from 'db://assets/scripts/domain/Attributes';
import { SKILL_TARGET_TYPES, isTauntable } from 'db://assets/scripts/domain/SkillTargeting';
import { MAX_PARTY_SIZE } from 'db://assets/scripts/domain/CombatTypes';
import { runToCompletion } from 'db://assets/scripts/domain/CombatResolver';
import { SPIRITUAL_ROOT_IDS } from 'db://assets/scripts/domain/HeroGrowth';

const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..');

/**
 * 读数据表目录。结构与 tools/validate-data.mjs 一致：
 * 每个条目一个文件，便于策划分工与 diff 审查。
 */
function loadDir<T>(relPath: string): T[] {
    const dir = path.join(REPO_ROOT, relPath);
    return readdirSync(dir)
        .filter((name) => name.endsWith('.json'))
        .flatMap((name) => {
            const parsed = JSON.parse(readFileSync(path.join(dir, name), 'utf8'));
            return Array.isArray(parsed) ? parsed : [parsed];
        }) as T[];
}

const careers = loadDir<CareerData>('assets/data/careers').filter((c) => 'skillIds' in c);
const skills = loadDir<SkillData>('assets/data/careers/skills');
const startingHeroes = loadDir<HeroData>('assets/data/heroes');

const careerMap = new Map(careers.map((c) => [c.id, c]));
const skillMap = new Map(skills.map((s) => [s.id, s]));

/**
 * 仓库内的平衡表。测试一律显式传入，不依赖各模块的兜底默认值——
 * 兜底路径下成长恒为 0，测出来的「属性增长」会是假的通过。
 */
const balance: HeroBalanceContext = (() => {
    const read = (name: string) =>
        JSON.parse(
            readFileSync(path.join(REPO_ROOT, 'assets/data/balance', `${name}.json`), 'utf8'),
        );
    const tables = parseBalanceTables({
        growth_rates: read('growth_rates'),
        spiritual_root_multipliers: read('spiritual_root_multipliers'),
        combat_constants: read('combat_constants'),
        production_rates: read('production_rates'),
        realm_ranges: read('realm_ranges'),
    });
    return {
        growthRates: tables.growthRates,
        spiritualRootMultipliers: tables.spiritualRootMultipliers,
        constitutionHpFactor: tables.combat.constitutionHpFactor,
    };
})();

describe('职业数据表（策划案 §7.3）', () => {
    test('六个初始职业', () => {
        assert.equal(careers.length, 6);
    });

    test('每职业恰好三个技能（PRD-04 §4）', () => {
        for (const career of careers) {
            assert.equal(career.skillIds.length, 3, `${career.id} 技能数不为 3`);
        }
    });

    test('技能 ID 全部存在于技能表', () => {
        for (const career of careers) {
            for (const skillId of career.skillIds) {
                assert.ok(skillMap.has(skillId), `${career.id} 引用了不存在的技能 ${skillId}`);
            }
        }
    });

    test('七维基础值齐全且非负', () => {
        for (const career of careers) {
            for (const key of ATTRIBUTE_KEYS) {
                const value = career.baseAttributes[key];
                assert.ok(
                    Number.isInteger(value) && value >= 0,
                    `${career.id} 的 ${key} 非法: ${value}`,
                );
            }
        }
    });

    test('主属性在七维之内', () => {
        for (const career of careers) {
            assert.ok(
                (ATTRIBUTE_KEYS as readonly string[]).includes(career.primaryAttribute),
                `${career.id} 主属性非法`,
            );
        }
    });

    test('基础生命为正', () => {
        for (const career of careers) {
            assert.ok(career.baseHp > 0, `${career.id} 基础生命非正`);
        }
    });

    test('体修生命最高、法修最低（职责区分）', () => {
        const tiXiu = careerMap.get('ti_xiu')!;
        const faXiu = careerMap.get('fa_xiu')!;
        // 定位差异必须体现在数值上，否则职业选择无意义
        assert.ok(tiXiu.baseHp > faXiu.baseHp);
    });

    test('职业 ID 无重复', () => {
        assert.equal(new Set(careers.map((c) => c.id)).size, careers.length);
    });
});

describe('技能数据表', () => {
    test('十八个技能（六职业各三）', () => {
        assert.equal(skills.length, 18);
    });

    test('技能 ID 无重复', () => {
        assert.equal(new Set(skills.map((s) => s.id)).size, skills.length);
    });

    test('造成伤害的技能必须声明属性来源（技术方案 §10.1）', () => {
        for (const skill of skills) {
            if (skill.damageKind !== 'none') {
                assert.ok(
                    skill.scalingAttribute,
                    `${skill.id} 造成 ${skill.damageKind} 伤害却未声明 scalingAttribute`,
                );
            }
        }
    });

    test('目标类型均合法', () => {
        for (const skill of skills) {
            assert.ok(
                (SKILL_TARGET_TYPES as readonly string[]).includes(skill.targetType),
                `${skill.id} 目标类型非法: ${skill.targetType}`,
            );
        }
    });

    test('间隔与冷却为非负整数 tick', () => {
        for (const skill of skills) {
            for (const [field, value] of [
                ['baseIntervalTicks', skill.baseIntervalTicks],
                ['cooldownTicks', skill.cooldownTicks],
                ['castTicks', skill.castTicks],
            ] as const) {
                assert.ok(
                    Number.isInteger(value) && value >= 0,
                    `${skill.id} 的 ${field} 非法: ${value}`,
                );
            }
        }
    });

    test('基础间隔为正（0 会让单位每 tick 行动）', () => {
        for (const skill of skills) {
            assert.ok(skill.baseIntervalTicks > 0, `${skill.id} 间隔为 0`);
        }
    });

    test('不受嘲讽的目标类型不标冗余 ignoreTaunt', () => {
        // 是否受嘲讽由目标类型推导（SkillTargeting.isTauntable），
        // 群体技能再标 ignoreTaunt 是冗余，会让人误以为「去掉就会受嘲讽」。
        // DataValidator 对此给警告，两处规则必须一致。
        for (const skill of skills) {
            if (!isTauntable(skill.targetType)) {
                assert.equal(
                    skill.ignoreTaunt,
                    false,
                    `${skill.id} 的目标类型 ${skill.targetType} 本就不受嘲讽，不该标 ignoreTaunt`,
                );
            }
        }
    });

    test('嘲讽技能存在，否则承伤职责无法实现', () => {
        // PRD-04 §2 要求队伍详情显示嘲讽覆盖
        const taunts = skills.filter((s) => s.appliesStatus?.kind === 'gather_spirit');
        assert.ok(taunts.length > 0, '没有任何嘲讽技能');
    });

    test('治疗技能存在', () => {
        const heals = skills.filter(
            (s) => s.damageKind === 'none' && s.targetType.startsWith('ALLY_') && s.primaryPercent > 0,
        );
        assert.ok(heals.length > 0, '没有任何治疗技能');
    });

    test('全部可转成运行时技能', () => {
        const table = buildSkillTable(skills);
        assert.equal(table.size, skills.length);
    });

    test('转换保留目标类型与嘲讽标记', () => {
        const zhanJi = skillMap.get('zhan_ji')!;
        const runtime = toSkillRuntime(zhanJi);
        assert.equal(runtime.targetType, zhanJi.targetType);
        assert.equal(runtime.ignoreTaunt, zhanJi.ignoreTaunt);
        assert.equal(runtime.primaryAttribute, zhanJi.scalingAttribute);
    });

    test('无伤害技能用主属性占位但倍率为 0', () => {
        // 结算器要求 primaryAttribute 必填，占位不影响结果
        const tiaoXin = skillMap.get('tiao_xin')!;
        const runtime = toSkillRuntime(tiaoXin);
        assert.equal(runtime.primaryPercent, 0);
        assert.ok(runtime.primaryAttribute);
    });

    test('造成伤害却缺 scalingAttribute 时抛错（技术方案 §10.1）', () => {
        assert.throws(
            () =>
                toSkillRuntime({
                    ...skillMap.get('zhan_ji')!,
                    scalingAttribute: undefined,
                }),
            /未声明 scalingAttribute/,
        );
    });
});

describe('四名初始修士（PRD-04 §2）', () => {
    test('恰好四人', () => {
        assert.equal(startingHeroes.length, MAX_PARTY_SIZE);
    });

    test('实例 ID 无重复', () => {
        assert.equal(
            new Set(startingHeroes.map((h) => h.instanceId)).size,
            startingHeroes.length,
        );
    });

    test('职业各不相同，覆盖多种职责', () => {
        const ids = startingHeroes.map((h) => h.careerId);
        assert.equal(new Set(ids).size, ids.length, '存在重复职业');
    });

    test('包含治疗职业，否则前期战斗无法持续', () => {
        assert.ok(startingHeroes.some((h) => h.careerId === 'yi_xiu'));
    });

    test('包含能嘲讽的职业', () => {
        // 武修的挑衅是队伍唯一嘲讽来源
        assert.ok(startingHeroes.some((h) => h.careerId === 'wu_xiu'));
    });

    test('初始队不超过伪灵根（主线不得设高资质门槛）', () => {
        for (const hero of startingHeroes) {
            const rank = SPIRITUAL_ROOT_IDS.indexOf(hero.spiritualRootId);
            assert.ok(
                rank <= SPIRITUAL_ROOT_IDS.indexOf('pseudo_root'),
                `${hero.instanceId} 灵根 ${hero.spiritualRootId} 过高`,
            );
        }
    });

    test('全部可实例化', () => {
        for (const hero of startingHeroes) {
            const instance = instantiateHero(hero, careerMap, balance);
            assert.ok(instance.maxHp > 0);
            assert.equal(instance.skillIds.length, 3);
        }
    });
});

describe('实例化', () => {
    const hero: HeroData = {
        instanceId: 'test_1',
        nameKey: 'hero.test',
        careerId: 'wu_xiu',
        spiritualRootId: 'pseudo_root',
        realmId: 'lian_qi',
        level: 1,
    };

    test('1 级时成长为 0，最终值只来自灵根缩放后的基础值', () => {
        const instance = instantiateHero(hero, careerMap, balance);
        const { base, growth, final } = instance.attributes;
        for (const key of ATTRIBUTE_KEYS) {
            assert.equal(growth[key], 0, `${key} 在 1 级的成长应为 0`);
        }
        assert.equal(final.strength, base.strength);
    });

    test('境界必须与等级一致', () => {
        assert.throws(
            () => instantiateHero({ ...hero, realmId: 'zhu_ji' }, careerMap, balance),
            /境界 zhu_ji 与等级 1 不一致，应为 lian_qi/,
        );
    });

    test('1 级基础值已按灵根缩放，杂灵根等于职业表裸值', () => {
        const career = careerMap.get('wu_xiu')!;
        const mixedRoot = instantiateHero(
            { ...hero, spiritualRootId: 'mixed_root' },
            careerMap,
            balance,
        );
        assert.equal(mixedRoot.attributes.base.strength, career.baseAttributes.strength);

        const pseudoRoot = instantiateHero(hero, careerMap, balance);
        assert.ok(
            pseudoRoot.attributes.base.strength > career.baseAttributes.strength,
        );
    });

    test('七维全部随等级成长，无一冻结', () => {
        // 旧结构只长主维与副维，法修等职业的生命上限从 1 级到 60 级完全不变
        const lv1 = instantiateHero(hero, careerMap, balance);
        const lv60 = instantiateHero(
            { ...hero, realmId: 'lian_xu', level: 60 },
            careerMap,
            balance,
        );
        for (const key of ATTRIBUTE_KEYS) {
            assert.ok(
                lv60.attributes.final[key] > lv1.attributes.final[key],
                `${key} 从 1 级到 60 级没有变化，该维被冻结`,
            );
        }
    });

    test('全部六个职业的生命上限都随等级增长', () => {
        // 问题的实际症状：法修/医修/潜修/符修的 baseHp 与 constitution 都不长，
        // maxHp 从 Lv1 到 Lv60 恒定不变
        for (const career of careers) {
            const lv1 = instantiateHero(
                { ...hero, careerId: career.id, level: 1 },
                careerMap,
                balance,
            );
            const lv60 = instantiateHero(
                { ...hero, careerId: career.id, realmId: 'lian_xu', level: 60 },
                careerMap,
                balance,
            );
            assert.ok(
                lv60.maxHp > lv1.maxHp * 2,
                `${career.id} 的生命上限 ${lv1.maxHp} → ${lv60.maxHp} 增长不足 2 倍`,
            );
        }
    });

    test('缺成长率配置时抛错，而非静默按零成长处理', () => {
        assert.throws(
            () =>
                instantiateHero(hero, careerMap, {
                    ...balance,
                    growthRates: {},
                }),
            /缺少成长率配置/,
        );
    });

    test('等级提升后属性增长', () => {
        const lv1 = instantiateHero(hero, careerMap, balance);
        const lv20 = instantiateHero(
            { ...hero, realmId: 'zhu_ji', level: 20 },
            careerMap,
            balance,
        );
        assert.ok(lv20.attributes.final.strength > lv1.attributes.final.strength);
        assert.ok(lv20.maxHp > lv1.maxHp);
    });

    test('灵根越高属性越强', () => {
        const low = instantiateHero(
            { ...hero, spiritualRootId: 'mixed_root', realmId: 'zhu_ji', level: 20 },
            careerMap,
            balance,
        );
        const high = instantiateHero(
            { ...hero, spiritualRootId: 'variant_root', realmId: 'zhu_ji', level: 20 },
            careerMap,
            balance,
        );
        assert.ok(high.attributes.final.strength > low.attributes.final.strength);
    });

    test('属性拆解可查（PRD-03 §8）', () => {
        const instance = instantiateHero(
            { ...hero, realmId: 'zhu_ji', level: 20 },
            careerMap,
            balance,
        );
        const { base, growth, final } = instance.attributes;
        // 五个来源都要能单独展示
        assert.ok(base.strength > 0);
        assert.ok(growth.strength > 0);
        assert.equal(final.strength, base.strength + growth.strength);
    });

    test('装备加成计入', () => {
        const withGear = instantiateHero(
            { ...hero, equipmentBonus: { ...ZERO_ATTRS, strength: 50 } },
            careerMap,
            balance,
        );
        const without = instantiateHero(hero, careerMap, balance);
        assert.equal(
            withGear.attributes.final.strength - without.attributes.final.strength,
            50,
        );
    });

    test('未知职业抛错而非静默跳过', () => {
        // 静默会让玩家发现角色凭空消失，比报错更难查
        assert.throws(
            () => instantiateHero({ ...hero, careerId: 'ghost' }, careerMap, balance),
            /不存在于数据表/,
        );
    });

    test('等级越界抛错', () => {
        assert.throws(() => instantiateHero({ ...hero, level: 0 }, careerMap, balance), /超出/);
        assert.throws(() => instantiateHero({ ...hero, level: 999 }, careerMap, balance), /超出/);
    });
});

describe('转战斗单位', () => {
    test('满血入场', () => {
        const instance = instantiateHero(startingHeroes[0]!, careerMap, balance);
        const unit = toCombatUnit(instance, 1);
        assert.equal(unit.currentHp, instance.maxHp);
        assert.equal(unit.isDead, false);
    });

    test('可指定当前血量（带伤入山）', () => {
        const instance = instantiateHero(startingHeroes[0]!, careerMap, balance);
        const unit = toCombatUnit(instance, 1, 'ally', 30);
        assert.equal(unit.currentHp, 30);
    });

    test('首次行动时间错开，避免全队同 tick 出手', () => {
        const instances = startingHeroes.map((h) => instantiateHero(h, careerMap, balance));
        const timers = instances.map((inst, i) => toCombatUnit(inst, i + 1).actionTimer);
        assert.ok(new Set(timers).size > 1, '全队行动时间相同');
    });

    test('阵营可指定', () => {
        const instance = instantiateHero(startingHeroes[0]!, careerMap, balance);
        assert.equal(toCombatUnit(instance, 1, 'enemy').side, 'enemy');
    });
});

describe('四人队实战（端到端）', () => {
    test('初始队伍能打赢两个同级敌人', () => {
        const table = buildSkillTable(skills);
        const allies = startingHeroes.map((hero, i) =>
            toCombatUnit(instantiateHero(hero, careerMap, balance), i + 1, 'ally'),
        );
        // 敌人用同一套数据，血量减半模拟低阶敌人
        const enemies = [0, 1].map((i) => {
            const inst = instantiateHero(
                {
                    ...startingHeroes[0]!,
                    instanceId: `enemy_${i}`,
                    spiritualRootId: 'mixed_root',
                },
                careerMap,
                balance,
            );
            return {
                ...toCombatUnit(inst, 100 + i, 'enemy'),
                currentHp: Math.floor(inst.maxHp / 2),
            };
        });

        const { snapshot, events } = runToCompletion(
            { tick: 0, units: [...allies, ...enemies], outcome: null },
            { skills: table, random: () => 0.5 },
        );

        assert.equal(snapshot.outcome, 'ally_win', `实际 ${snapshot.outcome}`);
        // 应产生完整事件序列供表现层播放
        assert.ok(events.some((e) => e.type === 'damage.dealt'));
        assert.ok(events.some((e) => e.type === 'unit.died'));
        assert.ok(events.some((e) => e.type === 'combat.ended'));
    });

    test('战斗在合理时长内结束', () => {
        const table = buildSkillTable(skills);
        const allies = startingHeroes.map((hero, i) =>
            toCombatUnit(instantiateHero(hero, careerMap, balance), i + 1, 'ally'),
        );
        const enemies = [0, 1, 2].map((i) => {
            const inst = instantiateHero(
                {
                    ...startingHeroes[0]!,
                    instanceId: `e${i}`,
                    spiritualRootId: 'mixed_root',
                },
                careerMap,
                balance,
            );
            return toCombatUnit(inst, 200 + i, 'enemy');
        });

        const { snapshot } = runToCompletion(
            { tick: 0, units: [...allies, ...enemies], outcome: null },
            { skills: table, random: () => 0.5 },
        );

        // 20Hz，1200 tick = 60 秒。普通战斗不该拖这么久
        assert.ok(snapshot.tick < 1200, `耗时 ${snapshot.tick} tick 过长`);
    });
});

const ZERO_ATTRS = Object.fromEntries(ATTRIBUTE_KEYS.map((k) => [k, 0])) as Record<
    (typeof ATTRIBUTE_KEYS)[number],
    number
>;
