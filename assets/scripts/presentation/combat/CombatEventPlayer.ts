import { Color, tween, Tween, UIOpacity, Vec3 } from 'cc';
import type { CombatEventPayload } from 'db://assets/scripts/domain/CombatState';
import type { CombatSessionView } from 'db://assets/scripts/services/combat/CombatApplicationModels';
import type { CombatSceneNodes } from './CombatSceneView';
import { combatStatusText, combatText } from './CombatText';
import type { CombatUnitView } from './CombatUnitView';
import { combatLabel } from './CombatUiPrimitives';

export class CombatEventPlayer {
    private readonly nodes: CombatSceneNodes;
    private readonly views: ReadonlyMap<number, CombatUnitView>;

    constructor(nodes: CombatSceneNodes, views: ReadonlyMap<number, CombatUnitView>) {
        this.nodes = nodes;
        this.views = views;
    }

    play(events: readonly CombatEventPayload[], session: CombatSessionView): void {
        events.forEach((event) => {
            switch (event.type) {
                case 'unit.acted':
                    this.playAction(event.actorId, event.skillId, session);
                    break;
                case 'damage.dealt':
                    this.showFloating(event.targetId, `-${event.amount}`, new Color(238, 105, 77));
                    this.bump(event.targetId);
                    break;
                case 'heal.applied':
                    this.showFloating(event.targetId, `+${event.amount}`, new Color(103, 219, 151));
                    break;
                case 'status.applied':
                    this.showFloating(
                        event.targetId,
                        combatStatusText(event.kind),
                        new Color(129, 207, 215),
                    );
                    break;
                case 'status.ticked':
                    this.showFloating(event.targetId, `-${event.amount}`, new Color(178, 106, 196));
                    break;
                case 'unit.died':
                    this.showFloating(event.unitId, '阵亡', new Color(181, 181, 177));
                    break;
            }
        });
    }

    private playAction(actorId: number, skillId: string, session: CombatSessionView): void {
        const skill = session.catalog.skills.get(skillId);
        const actor = session.snapshot.units.find((unit) => unit.unitId === actorId);
        const name = actor ? combatText(session.unitMeta.get(actorId)?.nameKey ?? actor.nameKey) : '';
        this.nodes.skillBanner.string = `${name} · ${combatText(skill?.nameKey ?? skillId)}`;
        const view = this.views.get(actorId);
        if (!view) return;
        Tween.stopAllByTarget(view.artRoot);
        tween(view.artRoot)
            .to(0.08, { scale: new Vec3(1.05, 1.05, 1) })
            .to(0.12, { scale: new Vec3(1, 1, 1) })
            .start();
    }

    private bump(unitId: number): void {
        const view = this.views.get(unitId);
        if (!view) return;
        Tween.stopAllByTarget(view.artRoot);
        tween(view.artRoot)
            .by(0.05, { position: new Vec3(4, 0, 0) })
            .by(0.05, { position: new Vec3(-8, 0, 0) })
            .by(0.05, { position: new Vec3(4, 0, 0) })
            .start();
    }

    private showFloating(unitId: number, text: string, color: Color): void {
        const view = this.views.get(unitId);
        if (!view) return;
        const label = combatLabel(
            view.floatRoot,
            `Float_${Date.now()}`,
            text,
            0,
            0,
            78,
            24,
            15,
            color,
        );
        const opacity = label.node.addComponent(UIOpacity);
        tween(label.node)
            .by(0.55, { position: new Vec3(0, 28, 0) })
            .call(() => label.node.destroy())
            .start();
        tween(opacity).delay(0.25).to(0.3, { opacity: 0 }).start();
    }
}
