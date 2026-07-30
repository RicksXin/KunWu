/**
 * BundleHost 的引擎实现（PRD-10 §3、任务 #17b）。
 *
 * 职责边界：只把三个方法映射到 cc.assetManager，不含加载策略。
 * 重试退避、并发去重、条件预载、卸载时机都在 BundleLoader（已有 26 个单测）。
 *
 * 之所以薄成这样，是为了让所有会出错的判断留在可单测的领域层。
 */

import { assetManager } from 'cc';
import type { BundleHost } from '../services/BundleLoader';
import type { BundleName } from '../services/BundleManifest';

export class CocosBundleHost implements BundleHost {
    load(name: BundleName): Promise<void> {
        return new Promise((resolve, reject) => {
            // 已加载时 loadBundle 也会成功回调，但先查一次可省去一次内部查找
            if (assetManager.getBundle(name)) {
                resolve();
                return;
            }

            assetManager.loadBundle(name, (error) => {
                if (error) {
                    // 原样抛出引擎错误，由 BundleLoader 决定是否重试
                    reject(error);
                    return;
                }
                resolve();
            });
        });
    }

    release(name: BundleName): void {
        const bundle = assetManager.getBundle(name);
        if (!bundle) {
            return;
        }
        // releaseAll 释放包内全部资源；随后移除包本身，
        // 否则 getBundle 仍返回空壳，isLoaded 会误报已加载
        bundle.releaseAll();
        assetManager.removeBundle(bundle);
    }

    isLoaded(name: BundleName): boolean {
        return assetManager.getBundle(name) !== null;
    }
}
