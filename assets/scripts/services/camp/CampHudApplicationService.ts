import type { EventBus } from 'db://assets/scripts/services/EventBus';
import type { GameState } from 'db://assets/scripts/services/GameState';
import {
    CampApplicationError,
    toCampApplicationError,
} from './CampApplicationError';
import {
    applyCampHudSnapshot,
    toCampHudViewModel,
} from './CampApplicationMappers';
import type { CampHudViewModel } from './CampApplicationModels';
import type { CampApiPort } from 'db://assets/scripts/services/camp/api/CampApiPort';

export interface CampHudApplicationServiceDeps {
    readonly api: CampApiPort;
    readonly state: GameState;
    readonly events: EventBus;
    readonly save: () => Promise<void>;
}

export class CampHudApplicationService {
    private readonly deps: CampHudApplicationServiceDeps;
    private model: CampHudViewModel | null = null;
    private refreshInFlight: Promise<CampHudViewModel> | null = null;
    private generation = 0;

    constructor(deps: CampHudApplicationServiceDeps) {
        this.deps = deps;
    }

    get current(): CampHudViewModel | null {
        return this.model;
    }

    invalidate(): void {
        this.model = null;
        this.refreshInFlight = null;
        this.generation += 1;
    }

    refresh(): Promise<CampHudViewModel> {
        if (this.refreshInFlight) return this.refreshInFlight;
        const request = this.load(this.generation);
        this.refreshInFlight = request;
        request.then(
            () => this.clearRefresh(request),
            () => this.clearRefresh(request),
        );
        return request;
    }

    private async load(generation: number): Promise<CampHudViewModel> {
        try {
            const dto = await this.deps.api.getCampHud();
            if (generation !== this.generation) {
                return this.refresh();
            }
            applyCampHudSnapshot(this.deps.state.require(), dto);
            const model = toCampHudViewModel(dto);
            this.model = model;
            this.deps.events.emit('camp.hudChanged', model);
            try {
                await this.deps.save();
            } catch {
                throw new CampApplicationError(
                    'save_failed',
                    '数据已更新，但存档失败',
                    true,
                );
            }
            return model;
        } catch (error) {
            throw toCampApplicationError(error);
        }
    }

    private clearRefresh(request: Promise<CampHudViewModel>): void {
        if (this.refreshInFlight === request) {
            this.refreshInFlight = null;
        }
    }
}
