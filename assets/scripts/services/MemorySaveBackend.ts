/**
 * 内存存档后端。
 *
 * 用途：单测，以及 IndexedDB 不可用时的降级运行（PRD-10 §8：
 * IndexedDB 失败保留内存状态并提示导出）。
 *
 * 事务语义：在快照上操作，work 抛错则整体丢弃，与 IndexedDB 回滚行为一致。
 */

import type { SaveBackend, SaveTransaction } from './SaveBackend';
import type { SaveStore } from './SaveService';
import { SAVE_STORES } from './SaveService';

type Stores = Map<SaveStore, Map<string, string>>;

function createStores(): Stores {
    const stores: Stores = new Map();
    for (const store of SAVE_STORES) {
        stores.set(store, new Map());
    }
    return stores;
}

function cloneStores(source: Stores): Stores {
    const copy: Stores = new Map();
    for (const [store, entries] of source) {
        copy.set(store, new Map(entries));
    }
    return copy;
}

export class MemorySaveBackend implements SaveBackend {
    private stores: Stores = createStores();
    /** 置为 true 时下一次事务提交前抛错，用于测试「失败保留旧档」。 */
    failNextCommit = false;

    async transact<T>(
        _stores: readonly SaveStore[],
        work: (tx: SaveTransaction) => Promise<T>,
    ): Promise<T> {
        const snapshot = cloneStores(this.stores);
        const staged = cloneStores(this.stores);

        const tx: SaveTransaction = {
            get: async <V>(store: SaveStore, key: string): Promise<V | undefined> => {
                const raw = staged.get(store)?.get(key);
                // 存的是序列化字符串，取出时反序列化，避免测试里共享同一对象引用
                return raw === undefined ? undefined : (JSON.parse(raw) as V);
            },
            put: async (store: SaveStore, key: string, value: unknown): Promise<void> => {
                staged.get(store)?.set(key, JSON.stringify(value));
            },
            delete: async (store: SaveStore, key: string): Promise<void> => {
                staged.get(store)?.delete(key);
            },
            keys: async (store: SaveStore): Promise<string[]> => {
                return Array.from(staged.get(store)?.keys() ?? []).sort();
            },
        };

        try {
            const result = await work(tx);
            if (this.failNextCommit) {
                this.failNextCommit = false;
                throw new Error('模拟提交失败');
            }
            this.stores = staged;
            return result;
        } catch (error) {
            this.stores = snapshot;
            throw error;
        }
    }

    close(): void {
        this.stores = createStores();
    }

    /** 测试辅助：直接写入原始值，用于构造坏档。 */
    seedRaw(store: SaveStore, key: string, rawJson: string): void {
        this.stores.get(store)?.set(key, rawJson);
    }

    /** 测试辅助：查看某 store 的键。 */
    rawKeys(store: SaveStore): string[] {
        return Array.from(this.stores.get(store)?.keys() ?? []).sort();
    }
}
