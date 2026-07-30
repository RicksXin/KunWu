/**
 * 音频通道管理（技术方案 §4.1、§14）。
 *
 * 职责边界：只管播放与音量，不承担关卡逻辑。
 */

/** 音频总线（技术方案 §14）。 */
export const AUDIO_BUSES = ['master', 'music', 'ambient', 'sfx', 'ui'] as const;
export type AudioBus = (typeof AUDIO_BUSES)[number];

export interface AudioServiceApi {
    playMusic(clipId: string, loop?: boolean): void;
    stopMusic(fadeSeconds?: number): void;
    playSfx(clipId: string): void;
    setBusVolume(bus: AudioBus, volume: number): void;
    getBusVolume(bus: AudioBus): number;
    /** 浏览器切后台时静音，回前台恢复。 */
    setSuspended(suspended: boolean): void;
}
