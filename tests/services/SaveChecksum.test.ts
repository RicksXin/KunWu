import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
    stableStringify,
    computeChecksum,
    fnv1a32,
} from 'db://assets/scripts/services/SaveChecksum';

describe('stableStringify', () => {
    test('键顺序不同但内容相同的对象序列化结果一致', () => {
        // 不稳定会导致正常存档被误判为损坏
        const a = { alpha: 1, beta: { x: 1, y: 2 } };
        const b = { beta: { y: 2, x: 1 }, alpha: 1 };
        assert.equal(stableStringify(a), stableStringify(b));
    });

    test('数组顺序参与序列化', () => {
        assert.notEqual(stableStringify([1, 2]), stableStringify([2, 1]));
    });

    test('undefined 值被跳过，与 JSON 往返一致', () => {
        const withUndefined = { a: 1, b: undefined };
        assert.equal(stableStringify(withUndefined), stableStringify({ a: 1 }));
    });

    test('嵌套 null 与空对象可序列化', () => {
        assert.equal(stableStringify({ a: null, b: {} }), '{"a":null,"b":{}}');
    });
});

describe('computeChecksum', () => {
    test('内容改变则校验值改变', () => {
        const before = computeChecksum({ grain: 100 });
        const after = computeChecksum({ grain: 101 });
        assert.notEqual(before, after);
    });

    test('键顺序不影响校验值', () => {
        assert.equal(computeChecksum({ a: 1, b: 2 }), computeChecksum({ b: 2, a: 1 }));
    });

    test('输出固定为 8 位十六进制', () => {
        const checksum = computeChecksum({ any: 'value' });
        assert.match(checksum, /^[0-9a-f]{8}$/);
    });
});

describe('fnv1a32', () => {
    test('空串有确定值', () => {
        // FNV-1a 32 位 offset basis
        assert.equal(fnv1a32(''), '811c9dc5');
    });

    test('已知向量：字符串 a', () => {
        assert.equal(fnv1a32('a'), 'e40c292c');
    });
});
