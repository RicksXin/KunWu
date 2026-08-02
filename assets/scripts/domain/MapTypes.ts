/**
 * 地图数据契约（PRD-05 §4、§7、§9）。
 *
 * 领域层只认格子坐标；像素换算由表现层负责（技术方案 §9.1）。
 */

import type { AttributeCheck } from './Attributes';

/** 固定对象类型（PRD-05 §7）。 */
export const MAP_OBJECT_KINDS = [
    'enemy_group',
    'boss_main',
    'boss_side',
    'boss_field',
    'resource_node',
    'treasure_chest',
    'story_event',
    'attribute_check',
    'npc',
    'temp_camp',
    'dungeon_entrance',
    'teleporter',
    'map_exit',
] as const;
export type MapObjectKind = (typeof MAP_OBJECT_KINDS)[number];

/** 对象状态机（PRD-05 §7）。 */
export const MAP_OBJECT_STATES = [
    'HIDDEN',
    'DISCOVERED',
    'AVAILABLE',
    'COMPLETED',
    'COOLDOWN',
    'REFRESHED',
    'DISABLED',
] as const;
export type MapObjectState = (typeof MAP_OBJECT_STATES)[number];

/** 迷雾状态（PRD-05 §5）。 */
export const FOG_STATES = ['UNKNOWN', 'DISCOVERED', 'VISIBLE'] as const;
export type FogState = (typeof FOG_STATES)[number];

/** 基础探查半径（PRD-05 §5）。探灵灯升级到 3/4/5。 */
export const BASE_VISION_RADIUS = 2;

export interface TileDefinition {
    readonly terrain: string;
    readonly walkable: boolean;
    /** 灵粮/步。已激活传送为 0（PRD-05 §4）。 */
    readonly moveCost: number;
    readonly visionBlock: boolean;
    readonly danger: number;
    readonly height: number;
    readonly tags: readonly string[];
}

/** 跨图出口条件（PRD-05 §9）。可组合。 */
export interface ExitCondition {
    readonly requiredQuestIds?: readonly string[];
    readonly requiredDeadBossIds?: readonly string[];
    readonly requiredItemIds?: readonly string[];
    readonly attributeCheck?: AttributeCheck;
}

export interface MapObjectDefinition {
    readonly id: string;
    readonly kind: MapObjectKind;
    /** 格子坐标，固定不变（PRD-05 §2）。 */
    readonly x: number;
    readonly y: number;
    readonly initialState: MapObjectState;
    /** kind 为 map_exit 时必填：目标地图 ID。 */
    readonly targetMapId?: string;
    /** 单向出口必须显式声明，UI 需提前提示能否返回（PRD-05 §9）。 */
    readonly isOneWay?: boolean;
    readonly exitCondition?: ExitCondition;
    /** kind 为 attribute_check 时必填。 */
    readonly attributeCheck?: AttributeCheck;
}

export interface MapDefinition {
    readonly id: string;
    readonly nameKey: string;
    readonly width: number;
    readonly height: number;
    /** 入山起始格。 */
    readonly entryX: number;
    readonly entryY: number;
    readonly objects: readonly MapObjectDefinition[];
}
