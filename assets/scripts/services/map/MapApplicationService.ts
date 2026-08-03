import { FogMap } from 'db://assets/scripts/domain/FogOfWar';
import { GridCoord } from 'db://assets/scripts/domain/GridCoord';
import { tryMove } from 'db://assets/scripts/domain/Movement';
import { demoObjectAt, demoTileAt } from 'db://assets/scripts/domain/map/DemoMapDefinition';
import type {
    DemoMapDefinition,
    DemoMapObjectDefinition,
} from 'db://assets/scripts/domain/map/DemoMapDefinition';
import type { HeroInstance } from 'db://assets/scripts/services/GameState';
import type { EventBus } from 'db://assets/scripts/services/EventBus';
import type { GameState } from 'db://assets/scripts/services/GameState';
import {
    clearNormalEnemyProgress,
    mapErrorMessage,
    mapMoveRejectionMessage,
    replaceRecord,
    replaceSet,
    restoreMapProgress,
    restoreRecordValue,
    restoreStamina,
} from './MapApplicationUtils';
import { settleMapReturn } from './MapReturnSettlement';
import { settleGrainDepletionDeath } from './MapDeathSettlement';
import type {
    MapActionResult,
    MapApplicationServiceDeps,
    MapMoveResult,
    MapObjectResolutionResult,
    StagedMapDeparture,
} from './MapApplicationModels';

/** Demo 地图应用服务；当前按 Demo 文档豁免 API First。 */
export class MapApplicationService {
    private readonly state: GameState;
    private readonly events: EventBus;
    private readonly save: () => Promise<void>;
    private readonly nowUtcSeconds: () => number;
    private readonly readGrainDepletionStepLimit: () => number;
    private pendingDeparture: StagedMapDeparture | null = null;

    constructor(deps: MapApplicationServiceDeps) {
        this.state = deps.state;
        this.events = deps.events;
        this.save = deps.save;
        this.nowUtcSeconds = deps.nowUtcSeconds;
        this.readGrainDepletionStepLimit = deps.readGrainDepletionStepLimit;
    }

    stageDeparture(departure: StagedMapDeparture): void {
        const preset = this.state.require().expeditionPreparation.partyPresets.find(
            (candidate) => candidate.presetId === departure.partyPresetId,
        );
        const partyMemberIds = Array.isArray(departure.partyMemberIds)
            ? departure.partyMemberIds
            : preset?.slots.filter((id): id is string => id !== null) ?? [];
        this.pendingDeparture = {
            ...departure,
            loadout: { ...departure.loadout },
            partyMemberIds: [...partyMemberIds],
            carriedItems: { ...(departure.carriedItems ?? {}) },
            restUses: Number.isSafeInteger(departure.restUses) ? departure.restUses : 0,
        };
    }

    cancelStagedDeparture(): void {
        this.pendingDeparture = null;
    }

    async enter(map: DemoMapDefinition): Promise<MapActionResult> {
        const profile = this.state.require();
        if (profile.expedition) {
            return profile.expedition.mapId === map.id
                ? { ok: true }
                : { ok: false, message: '当前已有另一段入山进度' };
        }
        const pending = this.pendingDeparture;
        if (!pending || pending.mapId !== map.id) {
            return { ok: false, message: '没有可用的入山整备记录，请返回营地重试' };
        }

        const preset = profile.expeditionPreparation.partyPresets.find(
            (candidate) => candidate.presetId === pending.partyPresetId,
        );
        if (!preset) return { ok: false, message: '出发队伍已不存在' };
        const party = preset.slots
            .filter((id): id is string => id !== null)
            .map((id) => profile.roster.find((hero) => hero.instanceId === id))
            .filter((hero): hero is HeroInstance => hero !== undefined);
        if (party.length === 0 || party.some((hero) => hero.stamina < pending.staminaCost)) {
            return { ok: false, message: '队伍灵息不足，请返回营地重新整备' };
        }
        if (profile.wallet.spiritGrain < pending.loadout.spiritGrain) {
            return { ok: false, message: '携带灵粮已超过当前库存' };
        }
        for (const [itemId, amount] of Object.entries(pending.carriedItems)) {
            if ((profile.inventory[itemId] ?? 0) < amount) {
                return { ok: false, message: '携带物资已超过当前库存' };
            }
        }

        const walletBefore = profile.wallet.spiritGrain;
        const inventoryBefore = { ...profile.inventory };
        const staminaBefore = party.map((hero) => [hero.instanceId, hero.stamina] as const);
        const recoveryAnchorBefore = profile.expeditionPreparation.lastStaminaSettledAtUtc;
        const departedAtUtc = this.nowUtcSeconds();
        const enemyProgressBefore = clearNormalEnemyProgress(profile, map);
        try {
            profile.wallet.spiritGrain -= pending.loadout.spiritGrain;
            for (const [itemId, amount] of Object.entries(pending.carriedItems)) {
                profile.inventory[itemId] = (profile.inventory[itemId] ?? 0) - amount;
            }
            party.forEach((hero) => {
                hero.stamina -= pending.staminaCost;
            });
            profile.expeditionPreparation.lastStaminaSettledAtUtc = departedAtUtc;
            const entry = new GridCoord(map.entryX, map.entryY);
            const fog = new FogMap(map.activeWidth, map.activeHeight);
            fog.revealAround(entry, 2);
            profile.expedition = {
                mapId: map.id,
                partyPresetId: pending.partyPresetId,
                partyMemberIds: [...pending.partyMemberIds],
                position: entry,
                remainingGrain: pending.loadout.spiritGrain,
                grainCapacity: pending.loadout.spiritGrain,
                grainDepletionSteps: 0,
                carriedItems: { ...pending.carriedItems },
                restUsesRemaining: pending.restUses,
                isResting: false,
                restHealingUsed: false,
                revealedTiles: new Set(fog.toRevealedKeys()),
                temporaryLoot: {},
            };
            await this.save();
        } catch (error) {
            profile.wallet.spiritGrain = walletBefore;
            replaceRecord(profile.inventory, inventoryBefore);
            restoreStamina(profile, staminaBefore);
            profile.expeditionPreparation.lastStaminaSettledAtUtc = recoveryAnchorBefore;
            restoreMapProgress(profile, enemyProgressBefore);
            profile.expedition = null;
            return { ok: false, message: mapErrorMessage('入山状态保存失败', error) };
        }

        this.pendingDeparture = null;
        this.events.emit('wallet.changed', { wallet: profile.wallet });
        this.events.emit('inventory.changed', { inventory: profile.inventory });
        this.events.emit('heroes.staminaChanged', { staminaCost: pending.staminaCost });
        this.events.emit('expedition.started', { mapId: map.id });
        return { ok: true };
    }

    async move(map: DemoMapDefinition, to: GridCoord): Promise<MapMoveResult> {
        const profile = this.state.require();
        const expedition = profile.expedition;
        if (!expedition || expedition.mapId !== map.id) {
            return { ok: false, message: '当前没有可恢复的探索进度' };
        }
        const result = tryMove({
            from: expedition.position,
            to,
            bounds: { width: map.width, height: map.height },
            tile: demoTileAt(map, to),
            remainingGrain: expedition.remainingGrain,
            grainDepletionSteps: expedition.grainDepletionSteps,
            grainDepletionStepLimit: this.readGrainDepletionStepLimit(),
        });
        if (!result.ok) {
            return { ok: false, message: mapMoveRejectionMessage(result.reason) };
        }

        const previousPosition = expedition.position;
        const previousGrain = expedition.remainingGrain;
        const previousDepletionSteps = expedition.grainDepletionSteps;
        const previousRevealed = Array.from(expedition.revealedTiles);
        expedition.position = result.to;
        expedition.remainingGrain = result.remainingGrain;
        expedition.grainDepletionSteps = result.grainDepletionSteps;
        const fog = FogMap.fromRevealed(map.activeWidth, map.activeHeight, expedition.revealedTiles);
        fog.revealAround(result.to, 2);
        replaceSet(expedition.revealedTiles, fog.toRevealedKeys());
        try {
            await this.save();
        } catch (error) {
            expedition.position = previousPosition;
            expedition.remainingGrain = previousGrain;
            expedition.grainDepletionSteps = previousDepletionSteps;
            replaceSet(expedition.revealedTiles, previousRevealed);
            return { ok: false, message: mapErrorMessage('移动保存失败', error) };
        }

        this.events.emit('expedition.moved', {
            mapId: map.id,
            position: result.to.toKey(),
            remainingGrain: result.remainingGrain,
            grainDepletionSteps: result.grainDepletionSteps,
        });
        return {
            ok: true,
            position: result.to,
            grainSpent: result.grainSpent,
            grainDepletionSteps: result.grainDepletionSteps,
            partyWiped: result.partyWiped,
        };
    }

    async settleGrainDepletionDeath(mapId: string): Promise<MapActionResult> {
        return settleGrainDepletionDeath(
            this.returnDeps(),
            mapId,
            this.readGrainDepletionStepLimit(),
        );
    }

    async resolveObject(
        map: DemoMapDefinition,
        object: DemoMapObjectDefinition,
    ): Promise<MapObjectResolutionResult> {
        const profile = this.state.require();
        const expedition = profile.expedition;
        if (!expedition || expedition.mapId !== map.id) {
            return { ok: false, message: '当前没有可结算的探索进度' };
        }
        const standingObject = demoObjectAt(map, expedition.position);
        if (!standingObject || standingObject.id !== object.id) {
            return { ok: false, message: '队伍已经离开该地图对象' };
        }
        if (object.kind !== 'treasure_chest' && object.kind !== 'story_event') {
            return { ok: true, resolved: false };
        }
        const progressKey = `${map.id}.${object.id}`;
        if (profile.completedMapObjects[progressKey]) {
            return { ok: true, resolved: false };
        }

        const rewardId = object.reward?.itemId;
        const previousReward = rewardId ? expedition.temporaryLoot[rewardId] : undefined;
        profile.completedMapObjects[progressKey] = true;
        if (object.reward) {
            expedition.temporaryLoot[object.reward.itemId] =
                (previousReward ?? 0) + object.reward.amount;
        }
        try {
            await this.save();
        } catch (error) {
            delete profile.completedMapObjects[progressKey];
            if (rewardId) restoreRecordValue(expedition.temporaryLoot, rewardId, previousReward);
            return { ok: false, message: mapErrorMessage('地图对象保存失败', error) };
        }

        this.events.emit('map.objectResolved', {
            mapId: map.id,
            objectId: object.id,
            kind: object.kind,
        });
        return { ok: true, resolved: true };
    }

    async returnToCamp(map: DemoMapDefinition): Promise<MapActionResult> {
        const profile = this.state.require();
        const expedition = profile.expedition;
        if (!expedition || expedition.mapId !== map.id) {
            return { ok: false, message: '当前没有可结算的探索进度' };
        }
        if (expedition.isResting) return { ok: false, message: '请先结束休整' };
        const atEntry = expedition.position.x === map.entryX && expedition.position.y === map.entryY;
        if (!atEntry) {
            return { ok: false, message: '请先返回入口传送阵' };
        }
        return settleMapReturn(this.returnDeps(), { mapId: map.id });
    }

    async returnWithTalisman(map: DemoMapDefinition, itemId: string): Promise<MapActionResult> {
        const profile = this.state.require();
        const expedition = profile.expedition;
        if (!expedition || expedition.mapId !== map.id) {
            return { ok: false, message: '当前没有可结算的探索进度' };
        }
        if (expedition.isResting) return { ok: false, message: '请先结束休整' };
        if ((profile.inventory[itemId] ?? 0) <= 0) {
            return { ok: false, message: '没有归营符，无法直接归营' };
        }
        return settleMapReturn(this.returnDeps(), {
            mapId: map.id,
            consumeItemId: itemId,
        });
    }

    private returnDeps(): MapApplicationServiceDeps {
        return {
            state: this.state,
            events: this.events,
            save: this.save,
            nowUtcSeconds: this.nowUtcSeconds,
            readGrainDepletionStepLimit: this.readGrainDepletionStepLimit,
        };
    }
}
