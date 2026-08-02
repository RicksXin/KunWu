import { CampApiError } from 'db://assets/scripts/services/camp/api/CampApiPort';
import type { CampApiErrorCode } from 'db://assets/scripts/services/camp/api/CampApiPort';

export type CampApplicationErrorCode = CampApiErrorCode | 'save_failed';

export class CampApplicationError extends Error {
    readonly code: CampApplicationErrorCode;
    readonly retryable: boolean;

    constructor(code: CampApplicationErrorCode, message: string, retryable: boolean) {
        super(message);
        this.name = 'CampApplicationError';
        this.code = code;
        this.retryable = retryable;
    }
}

export function toCampApplicationError(error: unknown): CampApplicationError {
    if (error instanceof CampApplicationError) {
        return error;
    }
    if (error instanceof CampApiError) {
        return new CampApplicationError(error.code, messageFor(error.code), error.retryable);
    }
    return new CampApplicationError('internal', '营地数据操作失败，请稍后重试', true);
}

function messageFor(code: CampApiErrorCode): string {
    switch (code) {
        case 'profile_not_loaded': return '营地数据尚未加载';
        case 'config_unavailable': return '灵圃配置尚未加载';
        case 'unauthorized': return '登录状态已失效，请重新登录';
        case 'forbidden': return '当前账号无权执行此操作';
        case 'offline': return '当前网络不可用，请恢复连接后重试';
        case 'timeout': return '请求超时，请重试';
        case 'conflict': return '状态已发生变化，已刷新后请重试';
        case 'idempotency_key_reused': return '请求标识已被其他操作使用';
        case 'invalid_request': return '操作参数无效';
        case 'no_idle_worker': return '没有空闲杂役';
        case 'job_empty': return '该岗位当前没有杂役';
        case 'insufficient_spirit_grain': return '灵粮不足，无法招募';
        case 'insufficient_spirit_wood': return '灵木不足，无法升级';
        case 'max_storage_level': return '该资源储量已满级';
        default: return '营地服务暂时不可用，请稍后重试';
    }
}
