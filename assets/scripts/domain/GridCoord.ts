/**
 * 不可变格子坐标。
 *
 * 技术方案 §9.1 明确要求：不把世界像素坐标与格子坐标混用。
 * 这里用独立类型而非裸 {x, y}，让编译器拦住「把像素坐标传进格子 API」这类错误。
 * 像素换算一律由表现层负责，领域层只认格子。
 */
export class GridCoord {
    readonly x: number;
    readonly y: number;

    constructor(x: number, y: number) {
        if (!Number.isInteger(x) || !Number.isInteger(y)) {
            throw new Error(`GridCoord 只接受整数，收到 (${x}, ${y})`);
        }
        this.x = x;
        this.y = y;
    }

    equals(other: GridCoord): boolean {
        return this.x === other.x && this.y === other.y;
    }

    /** 四方向相邻判定，不含斜向（技术方案 §9.1：不允许斜走）。 */
    isAdjacentTo(other: GridCoord): boolean {
        return this.manhattanDistanceTo(other) === 1;
    }

    manhattanDistanceTo(other: GridCoord): number {
        return Math.abs(this.x - other.x) + Math.abs(this.y - other.y);
    }

    /**
     * 平方欧氏距离，用于视野的整数圆判定 dx² + dy² <= radius²。
     * 保持平方形式以避免开方带来的浮点误差。
     */
    squaredDistanceTo(other: GridCoord): number {
        const dx = this.x - other.x;
        const dy = this.y - other.y;
        return dx * dx + dy * dy;
    }

    /** 四方向邻格，顺序固定为上右下左，保证遍历结果可复现。 */
    neighbors(): GridCoord[] {
        return [
            new GridCoord(this.x, this.y + 1),
            new GridCoord(this.x + 1, this.y),
            new GridCoord(this.x, this.y - 1),
            new GridCoord(this.x - 1, this.y),
        ];
    }

    /** 用作 Map/Set 键，避免对象引用比较。 */
    toKey(): string {
        return `${this.x},${this.y}`;
    }

    static fromKey(key: string): GridCoord {
        const parts = key.split(',');
        if (parts.length !== 2) {
            throw new Error(`非法 GridCoord key: ${key}`);
        }
        return new GridCoord(Number(parts[0]), Number(parts[1]));
    }

    toString(): string {
        return `(${this.x}, ${this.y})`;
    }
}
