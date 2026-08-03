import type { ExpeditionPreparationConfig } from 'db://assets/scripts/domain/ExpeditionPreparation';
import type { EventBus } from 'db://assets/scripts/services/EventBus';
import type { GameState } from 'db://assets/scripts/services/GameState';
import { mapErrorMessage, restoreRecordValue } from './MapApplicationUtils';

export interface MapRestApplicationServiceDeps {
    readonly state: GameState;
    readonly events: EventBus;
    readonly save: () => Promise<void>;
}

export interface MapRestActionResult {
    readonly ok: boolean;
    readonly message: string;
}

export class MapRestApplicationService {
    private readonly deps: MapRestApplicationServiceDeps;
    private operationInFlight = false;

    constructor(deps: MapRestApplicationServiceDeps) {
        this.deps = deps;
    }

    async enter(): Promise<MapRestActionResult> {
        if (!this.beginOperation()) return busyResult();
        const expedition = this.deps.state.require().expedition;
        if (!expedition) return this.finishFailure('当前不在野外地图');
        if (expedition.isResting) return this.finishSuccess('正在休整');
        if (expedition.restUsesRemaining <= 0) return this.finishFailure('本次入山已没有休整机会');
        const before = expedition.restUsesRemaining;
        expedition.restUsesRemaining -= 1;
        expedition.isResting = true;
        expedition.restHealingUsed = false;
        try {
            await this.deps.save();
        } catch (error) {
            expedition.restUsesRemaining = before;
            expedition.isResting = false;
            this.endOperation();
            return { ok: false, message: mapErrorMessage('休整状态保存失败', error) };
        }
        this.deps.events.emit('expedition.restChanged', { resting: true });
        return this.finishSuccess('队伍开始原地休整');
    }

    async replenish(config: ExpeditionPreparationConfig): Promise<MapRestActionResult> {
        if (!this.beginOperation()) return busyResult();
        const expedition = this.deps.state.require().expedition;
        if (!expedition?.isResting) return this.finishFailure('当前不在休整状态');
        if (expedition.remainingGrain >= expedition.grainCapacity) {
            return this.finishFailure('灵粮已经达到本次携带上限');
        }
        const food = config.field.foodItems.find(
            (candidate) => (expedition.temporaryLoot[candidate.itemId] ?? 0) > 0,
        );
        if (!food) return this.finishFailure('没有可用的野外食材');
        const previousCount = expedition.temporaryLoot[food.itemId];
        const previousGrain = expedition.remainingGrain;
        const previousDepletionSteps = expedition.grainDepletionSteps;
        const nextCount = (previousCount ?? 0) - 1;
        if (nextCount > 0) expedition.temporaryLoot[food.itemId] = nextCount;
        else delete expedition.temporaryLoot[food.itemId];
        expedition.remainingGrain = Math.min(
            expedition.grainCapacity,
            expedition.remainingGrain + food.grainRestored,
        );
        expedition.grainDepletionSteps = 0;
        try {
            await this.deps.save();
        } catch (error) {
            restoreRecordValue(expedition.temporaryLoot, food.itemId, previousCount);
            expedition.remainingGrain = previousGrain;
            expedition.grainDepletionSteps = previousDepletionSteps;
            this.endOperation();
            return { ok: false, message: mapErrorMessage('补充灵粮保存失败', error) };
        }
        this.deps.events.emit('expedition.suppliesChanged', {
            remainingGrain: expedition.remainingGrain,
            consumedItemId: food.itemId,
        });
        return this.finishSuccess(`已补充 ${expedition.remainingGrain - previousGrain} 灵粮`);
    }

    async heal(config: ExpeditionPreparationConfig): Promise<MapRestActionResult> {
        if (!this.beginOperation()) return busyResult();
        const profile = this.deps.state.require();
        const expedition = profile.expedition;
        if (!expedition?.isResting) return this.finishFailure('当前不在休整状态');
        if (expedition.restHealingUsed) return this.finishFailure('本次休整已经运功疗伤');
        const members = new Set(expedition.partyMemberIds);
        const heroes = profile.roster.filter(
            (hero) => members.has(hero.instanceId) && !hero.isDead && hero.currentHp < hero.maxHp,
        );
        if (heroes.length === 0) return this.finishFailure('队伍当前无需疗伤');
        const before = heroes.map((hero) => [hero.instanceId, hero.currentHp] as const);
        for (const hero of heroes) {
            const recovered = Math.max(1, Math.ceil(hero.maxHp * config.field.healingPercent / 100));
            hero.currentHp = Math.min(hero.maxHp, hero.currentHp + recovered);
        }
        expedition.restHealingUsed = true;
        try {
            await this.deps.save();
        } catch (error) {
            const previous = new Map(before);
            heroes.forEach((hero) => { hero.currentHp = previous.get(hero.instanceId) ?? hero.currentHp; });
            expedition.restHealingUsed = false;
            this.endOperation();
            return { ok: false, message: mapErrorMessage('疗伤状态保存失败', error) };
        }
        this.deps.events.emit('heroes.healthChanged', { heroIds: heroes.map((hero) => hero.instanceId) });
        return this.finishSuccess(`全队恢复 ${config.field.healingPercent}% 最大生命`);
    }

    async continueExploration(): Promise<MapRestActionResult> {
        if (!this.beginOperation()) return busyResult();
        const expedition = this.deps.state.require().expedition;
        if (!expedition?.isResting) return this.finishFailure('当前不在休整状态');
        expedition.isResting = false;
        try {
            await this.deps.save();
        } catch (error) {
            expedition.isResting = true;
            this.endOperation();
            return { ok: false, message: mapErrorMessage('结束休整保存失败', error) };
        }
        this.deps.events.emit('expedition.restChanged', { resting: false });
        return this.finishSuccess('休整结束，继续探索');
    }

    private beginOperation(): boolean {
        if (this.operationInFlight) return false;
        this.operationInFlight = true;
        return true;
    }

    private finishSuccess(message: string): MapRestActionResult {
        this.endOperation();
        return { ok: true, message };
    }

    private finishFailure(message: string): MapRestActionResult {
        this.endOperation();
        return { ok: false, message };
    }

    private endOperation(): void {
        this.operationInFlight = false;
    }
}

function busyResult(): MapRestActionResult {
    return { ok: false, message: '休整操作处理中' };
}
