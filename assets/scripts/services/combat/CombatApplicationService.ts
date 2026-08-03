import { commandSkill, step } from 'db://assets/scripts/domain/CombatResolver';
import type { ResolverConfig } from 'db://assets/scripts/domain/CombatResolver';
import type { CombatEventPayload } from 'db://assets/scripts/domain/CombatState';
import type { ExpeditionPreparationConfig } from 'db://assets/scripts/domain/ExpeditionPreparation';
import type { EventBus } from 'db://assets/scripts/services/EventBus';
import type { GameState } from 'db://assets/scripts/services/GameState';
import type {
    CombatActionResult,
    CombatContext,
    CombatFrameResult,
    CombatLootActionResult,
    CombatLootPanelView,
    CombatSessionView,
    CombatSettlementResult,
} from './CombatApplicationModels';
import type { CombatCatalog } from './CombatCatalog';
import { combatPendingResult, combatSeedFrom } from './CombatApplicationUtils';
import {
    buildCombatLootPanel,
    dropCombatBackpackItem,
} from './CombatLootOperations';
import {
    readyManualAllyId,
    removeManualReadyUnit,
    syncManualReadyQueue,
} from './CombatManualQueue';
import {
    prepareCombatVictory,
    settleCombatDefeat,
    settleCombatExit,
    settlePreparedCombatLoot,
} from './CombatSettlement';
import { captureCombatActionMaximums, createCombatSession } from './CombatSessionFactory';
import type { ActiveCombatSession } from './CombatSessionFactory';

export interface CombatApplicationServiceDeps {
    readonly state: GameState;
    readonly events: EventBus;
    readonly save: () => Promise<void>;
    readonly nowUtcSeconds: () => number;
    readonly readExpeditionConfig: () => ExpeditionPreparationConfig | null;
}

/** Demo 战斗应用服务；持有临时会话，权威结算仍全部经过领域结算器。 */
export class CombatApplicationService {
    private readonly deps: CombatApplicationServiceDeps;
    private session: ActiveCombatSession | null = null;
    private randomState = 1;

    constructor(deps: CombatApplicationServiceDeps) {
        this.deps = deps;
    }

    start(context: CombatContext, catalog: CombatCatalog): CombatFrameResult {
        const created = createCombatSession(this.deps.state.require(), context, catalog);
        this.randomState = combatSeedFrom(context);
        this.session = created.session;
        return {
            view: this.current,
            events: [{
                type: 'combat.started',
                allyIds: created.allyIds,
                enemyIds: created.enemyIds,
            }],
        };
    }

    get current(): CombatSessionView {
        const session = this.requireSession();
        return {
            context: session.context,
            snapshot: session.snapshot,
            unitMeta: session.unitMeta,
            autoUnitIds: session.autoUnitIds,
            readyAllyId: this.readyAllyId(session),
            escapeAvailable: this.escapeAvailable(session),
            actionMaximums: session.actionMaximums,
            catalog: session.catalog,
            encounter: session.encounter,
        };
    }

    advance(): CombatFrameResult {
        const session = this.requireSession();
        if (session.snapshot.outcome !== null) return { view: this.current, events: [] };
        const before = session.snapshot;
        const result = step(before, this.resolverConfig(session));
        session.snapshot = result.snapshot;
        captureCombatActionMaximums(session, before.units, result.snapshot.units);
        syncManualReadyQueue(session);
        return { view: this.current, events: result.events };
    }

    useSkill(unitId: number, skillId: string): CombatActionResult {
        const session = this.requireSession();
        if (this.readyAllyId(session) !== unitId) {
            return { ok: false, message: '该修士尚未就绪', view: this.current, events: [] };
        }
        const before = session.snapshot;
        const result = commandSkill(before, unitId, skillId, this.resolverConfig(session));
        if (!result.accepted) {
            return { ok: false, message: '技能仍在冷却或当前没有合法目标', view: this.current, events: [] };
        }
        session.snapshot = result.snapshot;
        removeManualReadyUnit(session, unitId);
        captureCombatActionMaximums(session, before.units, result.snapshot.units);
        return { ok: true, view: this.current, events: result.events };
    }

    toggleAuto(unitId: number): CombatFrameResult {
        const session = this.requireSession();
        const unit = session.snapshot.units.find((candidate) => candidate.unitId === unitId);
        if (!unit || unit.side !== 'ally' || unit.isDead) return { view: this.current, events: [] };
        if (session.autoUnitIds.has(unitId)) {
            session.autoUnitIds.delete(unitId);
            syncManualReadyQueue(session);
        } else {
            session.autoUnitIds.add(unitId);
            if (unit.actionTimer !== 0) removeManualReadyUnit(session, unitId);
        }
        return { view: this.current, events: [] };
    }

    lootPanel(): CombatLootPanelView {
        const session = this.requireVictorySession();
        return buildCombatLootPanel(
            this.deps.state,
            session.context,
            session.snapshot,
            session.unitMeta,
            session.encounter.loot,
            this.requireExpeditionConfig(),
            session.encounter.soulCrystalReward,
            session.victoryPrepared,
        );
    }

    async dropBackpackItem(itemId: string): Promise<CombatLootActionResult> {
        const session = this.requireVictorySession();
        const config = this.requireExpeditionConfig();
        if (session.settling) {
            return { ok: false, message: '物品处理中', view: this.lootPanel() };
        }
        session.settling = true;
        try {
            return await dropCombatBackpackItem(
                this.deps,
                session.context,
                session.snapshot,
                session.unitMeta,
                session.encounter.loot,
                config,
                itemId,
                session.encounter.soulCrystalReward,
                session.victoryPrepared,
            );
        } finally {
            session.settling = false;
        }
    }

    async settleVictory(takeLoot: boolean): Promise<CombatSettlementResult> {
        const session = this.requireVictorySession();
        if (session.settling) return combatPendingResult('ally_win');
        session.settling = true;
        try {
            if (!session.victoryPrepared) {
                const prepared = await prepareCombatVictory(
                    this.deps,
                    session.context,
                    session.snapshot,
                    session.unitMeta,
                    session.encounter.soulCrystalReward,
                );
                if (!prepared.ok) return prepared;
                session.victoryPrepared = true;
            }
            return await settlePreparedCombatLoot(
                this.deps,
                session.context,
                session.snapshot,
                session.unitMeta,
                session.encounter.loot,
                takeLoot,
                this.requireExpeditionConfig(),
            );
        } finally {
            session.settling = false;
        }
    }

    async prepareVictory(): Promise<CombatSettlementResult> {
        const session = this.requireVictorySession();
        if (session.victoryPrepared) {
            return { ok: true, message: '战斗胜利已保存', destination: 'map', outcome: 'ally_win' };
        }
        if (session.settling) return combatPendingResult('ally_win');
        session.settling = true;
        try {
            const result = await prepareCombatVictory(
                this.deps,
                session.context,
                session.snapshot,
                session.unitMeta,
                session.encounter.soulCrystalReward,
            );
            if (result.ok) session.victoryPrepared = true;
            return result;
        } finally {
            session.settling = false;
        }
    }

    async settleOutcome(): Promise<CombatSettlementResult> {
        const session = this.requireSession();
        if (session.settling) return combatPendingResult(session.snapshot.outcome ?? 'draw');
        const outcome = session.snapshot.outcome;
        if (!outcome) return combatPendingResult('draw');
        session.settling = true;
        let result: CombatSettlementResult;
        if (outcome === 'ally_win') {
            session.settling = false;
            return {
                ok: false,
                message: '请先处理本场战利品',
                destination: 'map',
                outcome: 'ally_win',
            };
        } else if (outcome === 'enemy_win') {
            result = await settleCombatDefeat(this.deps, session.context);
        } else {
            const exited = await settleCombatExit(
                this.deps, session.context, session.snapshot, session.unitMeta,
            );
            result = { ...exited, outcome: 'draw' };
        }
        session.settling = false;
        return result;
    }

    async escape(): Promise<CombatSettlementResult> {
        const session = this.requireSession();
        if (!this.escapeAvailable(session)) {
            return { ok: false, message: '当前尚无法逃生', destination: 'map', outcome: 'escaped' };
        }
        if (session.settling) return combatPendingResult('escaped');
        session.settling = true;
        const result = await settleCombatExit(
            this.deps, session.context, session.snapshot, session.unitMeta,
        );
        session.settling = false;
        return result;
    }

    private resolverConfig(session: ActiveCombatSession): ResolverConfig {
        return {
            skills: new Map(Array.from(session.catalog.skills, ([id, skill]) => [id, skill.runtime])),
            random: this.nextRandom,
            defenseLevelConstant: session.catalog.defenseLevelConstant,
            deferActor: (actor) => actor.side === 'ally'
                && !session.autoUnitIds.has(actor.unitId),
        };
    }

    private readyAllyId(session: ActiveCombatSession): number | null {
        return readyManualAllyId(session);
    }

    private escapeAvailable(session: ActiveCombatSession): boolean {
        if (session.snapshot.outcome !== null) return false;
        const enemies = session.snapshot.units.filter((unit) => unit.side === 'enemy');
        const current = enemies.reduce((sum, unit) => sum + unit.currentHp, 0);
        const maximum = enemies.reduce((sum, unit) => sum + unit.maxHp, 0);
        return maximum > 0
            && current * 100 <= maximum * session.encounter.escapeEnemyHpPercent;
    }

    private readonly nextRandom = (): number => {
        this.randomState = (this.randomState * 1664525 + 1013904223) >>> 0;
        return this.randomState / 0x100000000;
    };

    private requireSession(): ActiveCombatSession {
        if (!this.session) throw new Error('战斗会话尚未创建');
        return this.session;
    }

    private requireVictorySession(): ActiveCombatSession {
        const session = this.requireSession();
        if (session.snapshot.outcome !== 'ally_win') throw new Error('战斗尚未胜利');
        return session;
    }

    private requireExpeditionConfig(): ExpeditionPreparationConfig {
        const config = this.deps.readExpeditionConfig();
        if (!config) throw new Error('入山负重配置尚未加载');
        return config;
    }
}
