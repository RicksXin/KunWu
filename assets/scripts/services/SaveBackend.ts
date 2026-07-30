/**
 * 存档后端抽象（技术方案 §13、PRD-10 §4）。
 *
 * 存在原因：PRD 要求「旧主档进 backups」与「写新档」在同一 transaction 内完成，
 * 失败必须保留旧档。这条约束只能在事务层表达，所以把「一次原子读改写」
 * 作为后端的最小单元，而不是暴露零散的 get/put 让上层自己拼。
 *
 * 领域层依赖此接口而非 IndexedDB，使写入流程可在 Node 下单测。
 */

import type { SaveStore } from './SaveService';

/** 单次事务内可用的操作。实现方保证这些操作要么全部生效，要么全部回滚。 */
export interface SaveTransaction {
    get<T>(store: SaveStore, key: string): Promise<T | undefined>;
    put(store: SaveStore, key: string, value: unknown): Promise<void>;
    delete(store: SaveStore, key: string): Promise<void>;
    /** 按时间升序返回键，用于备份轮转。 */
    keys(store: SaveStore): Promise<string[]>;
}

export interface SaveBackend {
    /**
     * 在一个事务内执行 work。
     * work 抛错时整个事务回滚，旧数据保持不变。
     */
    transact<T>(stores: readonly SaveStore[], work: (tx: SaveTransaction) => Promise<T>): Promise<T>;
    close(): void;
}
