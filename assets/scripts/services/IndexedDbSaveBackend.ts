/**
 * IndexedDB 存档后端（PRD-10 §4、任务 P0-TECH-002）。
 *
 * 职责边界：只把 SaveBackend 的事务语义映射到 IndexedDB，不含业务规则。
 * 业务流程（备份轮转、校验、迁移）在 SaveRepository。
 *
 * 只在浏览器运行；Node 单测使用 MemorySaveBackend。
 */

import type { SaveBackend, SaveTransaction } from './SaveBackend';
import type { SaveStore } from './SaveService';
import { SAVE_DB_NAME, SAVE_STORES } from './SaveService';

/** 数据库版本。新增 store 时递增。 */
export const SAVE_DB_VERSION = 1;

function wrap<T>(request: IDBRequest<T>): Promise<T> {
    return new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error ?? new Error('IndexedDB 请求失败'));
    });
}

export class IndexedDbSaveBackend implements SaveBackend {
    private db: IDBDatabase | null = null;

    static isSupported(): boolean {
        return typeof indexedDB !== 'undefined';
    }

    async open(): Promise<void> {
        if (this.db) {
            return;
        }

        this.db = await new Promise<IDBDatabase>((resolve, reject) => {
            const request = indexedDB.open(SAVE_DB_NAME, SAVE_DB_VERSION);

            request.onupgradeneeded = () => {
                const db = request.result;
                for (const store of SAVE_STORES) {
                    if (!db.objectStoreNames.contains(store)) {
                        db.createObjectStore(store);
                    }
                }
            };

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error ?? new Error('无法打开存档数据库'));
            // 另一个标签页占用旧版本时会触发 blocked，此时提示而非静默挂起
            request.onblocked = () => reject(new Error('存档数据库被其它标签页占用'));
        });
    }

    async transact<T>(
        stores: readonly SaveStore[],
        work: (tx: SaveTransaction) => Promise<T>,
    ): Promise<T> {
        if (!this.db) {
            await this.open();
        }
        const db = this.db;
        if (!db) {
            throw new Error('存档数据库未打开');
        }

        const idbTx = db.transaction(stores as string[], 'readwrite');

        // 事务完成/失败的独立 Promise：IndexedDB 事务在微任务队列耗尽时自动提交，
        // 必须等 oncomplete 才能确认落盘，否则「保存成功」可能是假的。
        const settled = new Promise<void>((resolve, reject) => {
            idbTx.oncomplete = () => resolve();
            idbTx.onerror = () => reject(idbTx.error ?? new Error('存档事务失败'));
            idbTx.onabort = () => reject(idbTx.error ?? new Error('存档事务被中止'));
        });

        const tx: SaveTransaction = {
            get: <V>(store: SaveStore, key: string) =>
                wrap<V>(idbTx.objectStore(store).get(key) as IDBRequest<V>),
            put: async (store: SaveStore, key: string, value: unknown) => {
                await wrap(idbTx.objectStore(store).put(value, key));
            },
            delete: async (store: SaveStore, key: string) => {
                await wrap(idbTx.objectStore(store).delete(key));
            },
            keys: async (store: SaveStore) => {
                const keys = await wrap(idbTx.objectStore(store).getAllKeys());
                return keys.map((key) => String(key)).sort();
            },
        };

        let result: T;
        try {
            result = await work(tx);
        } catch (error) {
            // 业务逻辑失败：主动中止，保证旧主档不被部分覆盖
            idbTx.abort();
            throw error;
        }

        await settled;
        return result;
    }

    close(): void {
        this.db?.close();
        this.db = null;
    }
}
