import { FogMap } from 'db://assets/scripts/domain/FogOfWar';
import { GridCoord } from 'db://assets/scripts/domain/GridCoord';
import { tryMove } from 'db://assets/scripts/domain/Movement';
import { demoObjectAt, demoTileAt } from 'db://assets/scripts/domain/map/DemoMapDefinition';
import type {
    DemoMapDefinition,
    DemoMapObjectDefinition,
} from 'db://assets/scripts/domain/map/DemoMapDefinition';
import type { ExpeditionLoadout } from 'db://assets/scripts/domain/ExpeditionPreparation';
import type { EventBus } from 'db://assets/scripts/services/EventBus';
import type { GameState, HeroInstance, Profile } from 'db://assets/scripts/services/GameState';

export interface StagedMapDeparture {
    readonly mapId: string;
    readonly partyPresetId: string;
    readonly staminaCost: number;
    readonly loadout: ExpeditionLoadout;
}

export type MapActionResult =
    | { readonly ok: true }
    | { readonly ok: false; readonly message: string };

export interface MapMoveResult {
    readonly ok: boolean;
    readonly message?: string;
    readonly position?: GridCoord;
    readonly grainSpent?: number;
}

export type MapObjectResolutionResult =
    | { readonly ok: true; readonly resolved: boolean }
    | { readonly ok: false; readonly message: string };

export interface MapApplicationServiceDeps {
    readonly state: GameState;
    readonly events: EventBus;
    readonly save: () => Promise<void>;
    readonly nowUtcSeconds: () => number;
}

/** Demo 地图应用服务；当前按 Demo 文档豁免 API First。 */
export class MapApplicationService {
    private readonly state: GameState;
    private readonly events: EventBus;
    private readonly save: () => Promise<void>;
    private readonly nowUtcSeconds: () => number;
    private pendingDeparture: StagedMapDeparture | null = null;

    constructor(deps: MapApplicationServiceDeps) {
        this.state = deps.state;
        this.events = deps.events;
        this.save = deps.save;
        this.nowUtcSeconds = deps.nowUtcSeconds;
    }

    stageDeparture(departure: StagedMapDeparture): void {
        this.pendingDeparture = {
            ...departure,
            loadout: { ...departure.loadout },
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

        const walletBefore = profile.wallet.spiritGrain;
        const staminaBefore = party.map((hero) => [hero.instanceId, hero.stamina] as const);
        const recoveryAnchorBefore = profile.expeditionPreparation.lastStaminaSettledAtUtc;
        const departedAtUtc = this.nowUtcSeconds();
        try {
            profile.wallet.spiritGrain -= pending.loadout.spiritGrain;
            party.forEach((hero) => {
                hero.stamina -= pending.staminaCost;
            });
            profile.expeditionPreparation.lastStaminaSettledAtUtc = departedAtUtc;
            const entry = new GridCoord(map.entryX, map.entryY);
            const fog = new FogMap(map.activeWidth, map.activeHeight);
            fog.revealAround(entry, 2);
            profile.expedition = {
                mapId: map.id,
                position: entry,
                remainingGrain: pending.loadout.spiritGrain,
                revealedTiles: new Set(fog.toRevealedKeys()),
                temporaryLoot: {},
            };
            await this.save();
        } catch (error) {
            profile.wallet.spiritGrain = walletBefore;
            restoreStamina(profile, staminaBefore);
            profile.expeditionPreparation.lastStaminaSettledAtUtc = recoveryAnchorBefore;
            profile.expedition = null;
            return { ok: false, message: errorMessage('入山状态保存失败', error) };
        }

        this.pendingDeparture = null;
        this.events.emit('wallet.changed', { wallet: profile.wallet });
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
        });
        if (!result.ok) {
            return { ok: false, message: rejectionMessage(result.reason) };
        }

        const previousPosition = expedition.position;
        const previousGrain = expedition.remainingGrain;
        const previousRevealed = Array.from(expedition.revealedTiles);
        expedition.position = result.to;
        expedition.remainingGrain = result.remainingGrain;
        const fog = FogMap.fromRevealed(map.activeWidth, map.activeHeight, expedition.revealedTiles);
        fog.revealAround(result.to, 2);
        replaceSet(expedition.revealedTiles, fog.toRevealedKeys());
        try {
            await this.save();
        } catch (error) {
            expedition.position = previousPosition;
            expedition.remainingGrain = previousGrain;
            replaceSet(expedition.revealedTiles, previousRevealed);
            return { ok: false, message: errorMessage('移动保存失败', error) };
        }

        this.events.emit('expedition.moved', {
            mapId: map.id,
            position: result.to.toKey(),
            remainingGrain: result.remainingGrain,
        });
        return {
            ok: true,
            position: result.to,
            grainSpent: result.grainSpent,
        };
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
            return { ok: false, message: errorMessage('地图对象保存失败', error) };
        }

        this.events.emit('map.objectResolved', {
            mapId: map.id,
            objectId: object.id,
            kind: object.kind,
        });
        return { ok: true, resolved: true };
    }

    async returnToCamp(map: DemoMapDefinition, emergency: boolean): Promise<MapActionResult> {
        const profile = this.state.require();
        const expedition = profile.expedition;
        if (!expedition || expedition.mapId !== map.id) {
            return { ok: false, message: '当前没有可结算的探索进度' };
        }
        const atEntry = expedition.position.x === map.entryX && expedition.position.y === map.entryY;
        if (!emergency && !atEntry) {
            return { ok: false, message: '请先返回入口传送阵' };
        }
        if (emergency && (atEntry || expedition.remainingGrain > 0)) {
            return { ok: false, message: '当前不满足紧急撤退条件' };
        }

        const walletBefore = profile.wallet.spiritGrain;
        const inventoryBefore = { ...profile.inventory };
        const previousExpedition = expedition;
        const recoveryAnchorBefore = profile.expeditionPreparation.lastStaminaSettledAtUtc;
        const returnedAtUtc = this.nowUtcSeconds();
        if (!emergency) {
            profile.wallet.spiritGrain += expedition.remainingGrain;
            for (const [itemId, amount] of Object.entries(expedition.temporaryLoot)) {
                profile.inventory[itemId] = (profile.inventory[itemId] ?? 0) + amount;
            }
        }
        profile.expeditionPreparation.lastStaminaSettledAtUtc = returnedAtUtc;
        profile.expedition = null;
        try {
            await this.save();
        } catch (error) {
            profile.wallet.spiritGrain = walletBefore;
            replaceRecord(profile.inventory, inventoryBefore);
            profile.expeditionPreparation.lastStaminaSettledAtUtc = recoveryAnchorBefore;
            profile.expedition = previousExpedition;
            return { ok: false, message: errorMessage('返营保存失败', error) };
        }

        this.events.emit('wallet.changed', { wallet: profile.wallet });
        if (!emergency) this.events.emit('inventory.changed', { inventory: profile.inventory });
        this.events.emit('expedition.ended', { mapId: map.id, emergency });
        return { ok: true };
    }
}

function rejectionMessage(reason: string): string {
    switch (reason) {
        case 'not_adjacent': return '只能移动到相邻格';
        case 'out_of_bounds': return '前方已超出当前开放区域';
        case 'not_walkable': return '前方被残禁封锁';
        case 'insufficient_grain': return '灵粮不足，可使用紧急撤退';
        default: return '当前无法移动';
    }
}

function replaceSet(target: Set<string>, values: readonly string[]): void {
    target.clear();
    values.forEach((value) => target.add(value));
}

function restoreStamina(profile: Profile, values: readonly (readonly [string, number])[]): void {
    const lookup = new Map(values);
    profile.roster.forEach((hero) => {
        const previous = lookup.get(hero.instanceId);
        if (previous !== undefined) hero.stamina = previous;
    });
}

function restoreRecordValue(record: Record<string, number>, key: string, value: number | undefined): void {
    if (value === undefined) delete record[key];
    else record[key] = value;
}

function replaceRecord(target: Record<string, number>, values: Readonly<Record<string, number>>): void {
    Object.keys(target).forEach((key) => delete target[key]);
    Object.assign(target, values);
}

function errorMessage(prefix: string, error: unknown): string {
    return `${prefix}：${error instanceof Error ? error.message : String(error)}`;
}
