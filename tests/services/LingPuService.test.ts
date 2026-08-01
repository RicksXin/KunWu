import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { parseLingPuConfig } from 'db://assets/scripts/domain/LingPu';
import type { LingPuConfig } from 'db://assets/scripts/domain/LingPu';
import { createDefaultProfile } from 'db://assets/scripts/services/ProfileCodec';
import type { Profile } from 'db://assets/scripts/services/GameState';
import { LingPuService } from 'db://assets/scripts/services/LingPuService';
import { TimeService } from 'db://assets/scripts/services/TimeService';

const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..');

class FakeTimeService extends TimeService {
    private current = 1_000;

    override nowUtcSeconds(): number {
        return this.current;
    }

    advance(seconds: number): void {
        this.current += seconds;
    }
}

function loadJson(relativePath: string): unknown {
    return JSON.parse(readFileSync(path.join(REPO_ROOT, relativePath), 'utf8'));
}

function loadConfig(): LingPuConfig {
    const raw = loadJson('assets/bundles/shared/ling_pu_config.json') as {
        ling_pu: unknown;
    };
    return parseLingPuConfig(raw.ling_pu);
}

function makeProfile(): Profile {
    return createDefaultProfile(
        loadJson('assets/bundles/shared/default_profile.json'),
        1_000,
    );
}

describe('灵圃服务编排', () => {
    test('调岗前先结算旧岗位，再应用新人数', () => {
        const time = new FakeTimeService();
        const service = new LingPuService(time);
        const profile = makeProfile();
        const config = loadConfig();
        profile.camp.workerAssignments.spiritGrain = 5;
        time.advance(30);

        const result = service.reassign(profile, config, 'spiritWood', 1);
        assert.equal(result.ok, true);
        assert.equal(result.settlement.yields.spiritGrain, 5);
        assert.equal(profile.wallet.spiritGrain, 125);
        assert.equal(profile.camp.workerAssignments.spiritWood, 1);
    });

    test('没有空闲杂役时调岗失败但已完成周期仍正常结算', () => {
        const time = new FakeTimeService();
        const service = new LingPuService(time);
        const profile = makeProfile();
        const config = loadConfig();
        profile.camp.workerAssignments.spiritGrain = 6;
        time.advance(30);

        const result = service.reassign(profile, config, 'spiritWood', 1);
        assert.equal(result.ok, false);
        assert.equal(result.failure, 'no_idle_worker');
        assert.equal(profile.wallet.spiritGrain, 126);
        assert.equal(profile.camp.workerAssignments.spiritWood, 0);
    });

    test('招募成功扣除配置灵粮并增加配置人数', () => {
        const service = new LingPuService(new FakeTimeService());
        const profile = makeProfile();
        const config = loadConfig();
        const before = profile.wallet.spiritGrain;

        const result = service.recruit(profile, config);
        assert.equal(result.ok, true);
        assert.equal(profile.camp.workerCount, 6 + config.workersPerRecruit);
        assert.equal(
            profile.wallet.spiritGrain,
            before - config.recruitSpiritGrainCost,
        );
    });

    test('储量升级扣灵木、升等级，不改变岗位', () => {
        const service = new LingPuService(new FakeTimeService());
        const profile = makeProfile();
        const config = loadConfig();
        profile.wallet.spiritWood = 999;
        profile.camp.workerAssignments.darkIron = 2;
        const preview = service.previewUpgrade(profile, config, 'spiritGrain');

        const result = service.upgradeStorage(profile, config, 'spiritGrain');
        assert.equal(result.ok, true);
        assert.equal(profile.camp.resourceStorageLevels.spiritGrain, 2);
        assert.equal(profile.wallet.spiritWood, 999 - preview.spiritWoodCost!);
        assert.equal(profile.camp.workerAssignments.darkIron, 2);
    });

    test('切后台恢复时重置在线结算锚点', () => {
        const time = new FakeTimeService();
        const service = new LingPuService(time);
        const profile = makeProfile();
        time.advance(300);
        service.resetOnlineAnchor(profile);
        assert.equal(profile.camp.lastSettledAtUtc, 1_300);
    });
});
