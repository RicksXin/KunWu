import type { CareerDefinition, SkillDefinition } from '../CareerTypes';
import type { MapDefinition } from '../MapTypes';

export const ID_PATTERN = /^[a-z][a-z0-9_]*$/;

export interface DropEntry {
    readonly itemId: string;
    readonly weight: number;
}

export interface DropTableDefinition {
    readonly id: string;
    readonly entries: readonly DropEntry[];
}

export interface DataBundle {
    readonly skills: readonly SkillDefinition[];
    readonly careers: readonly CareerDefinition[];
    readonly maps: readonly MapDefinition[];
    readonly dropTables: readonly DropTableDefinition[];
    readonly items: readonly { readonly id: string; readonly nameKey: string }[];
    readonly quests: readonly { readonly id: string }[];
    readonly localizationKeys: ReadonlySet<string>;
}
