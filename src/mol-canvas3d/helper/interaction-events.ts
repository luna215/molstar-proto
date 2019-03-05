/**
 * Copyright (c) 2018-2019 mol* contributors, licensed under MIT, See LICENSE file for more info.
 *
 * @author David Sehnal <david.sehnal@gmail.com>
 */

import { PickingId } from 'mol-geo/geometry/picking';
import { EmptyLoci } from 'mol-model/loci';
import { Representation } from 'mol-repr/representation';
import InputObserver, { ModifiersKeys, ButtonsType } from 'mol-util/input/input-observer';
import { RxEventHelper } from 'mol-util/rx-event-helper';

type Canvas3D = import('../canvas3d').Canvas3D

export class Canvas3dInteractionHelper {
    private ev = RxEventHelper.create();

    readonly events = {
        highlight: this.ev<import('../canvas3d').Canvas3D.HighlightEvent>(),
        click: this.ev<import('../canvas3d').Canvas3D.ClickEvent>(),
    };

    private cX = -1;
    private cY = -1;

    private lastX = -1;
    private lastY = -1;

    private id: PickingId | undefined = void 0;

    private currentIdentifyT = 0;

    private prevLoci: Representation.Loci = Representation.Loci.Empty;
    private prevT = 0;

    private inside = false;

    private buttons: ButtonsType = ButtonsType.create(0);
    private modifiers: ModifiersKeys = ModifiersKeys.None;

    private async identify(isClick: boolean, t: number) {
        if (this.lastX !== this.cX && this.lastY !== this.cY) {
            this.id = await this.canvasIdentify(this.cX, this.cY);
            this.lastX = this.cX;
            this.lastY = this.cY;
        }

        if (!this.id) return;

        if (isClick) {
            this.events.click.next({ current: this.getLoci(this.id), buttons: this.buttons, modifiers: this.modifiers });
            return;
        }

        // only highlight the latest
        if (!this.inside || this.currentIdentifyT !== t) {
            return;
        }

        const loci = this.getLoci(this.id);
        if (!Representation.Loci.areEqual(this.prevLoci, loci)) {
            this.events.highlight.next({ current: loci, prev: this.prevLoci, modifiers: this.modifiers });
            this.prevLoci = loci;
        }
    }

    tick(t: number) {
        if (this.inside && t - this.prevT > 1000 / this.maxFps) {
            this.prevT = t;
            this.currentIdentifyT = t;
            this.identify(false, t);
        }
    }

    leave() {
        this.inside = false;
        if (this.prevLoci.loci !== EmptyLoci) {
            const prev = this.prevLoci;
            this.prevLoci = Representation.Loci.Empty;
            this.events.highlight.next({ current: this.prevLoci, prev });
        }
    }

    move(x: number, y: number, modifiers: ModifiersKeys) {
        this.inside = true;
        this.modifiers = modifiers;
        this.cX = x;
        this.cY = y;
    }

    select(x: number, y: number, buttons: ButtonsType, modifiers: ModifiersKeys) {
        this.cX = x;
        this.cY = y;
        this.buttons = buttons;
        this.modifiers = modifiers;
        this.identify(true, 0);
    }

    modify(modifiers: ModifiersKeys) {
        if (this.prevLoci.loci === EmptyLoci || ModifiersKeys.areEqual(modifiers, this.modifiers)) return;
        this.modifiers = modifiers;
        this.events.highlight.next({ current: this.prevLoci, prev: this.prevLoci, modifiers: this.modifiers });
    }

    dispose() {
        this.ev.dispose();
    }

    constructor(private canvasIdentify: Canvas3D['identify'], private getLoci: Canvas3D['getLoci'], input: InputObserver, private maxFps: number = 15) {
        input.move.subscribe(({x, y, inside, buttons, modifiers }) => {
            if (!inside || buttons) { return; }
            this.move(x, y, modifiers);
        });

        input.leave.subscribe(() => {
            this.leave();
        });

        input.click.subscribe(({x, y, buttons, modifiers }) => {
            this.select(x, y, buttons, modifiers);
        });

        input.modifiers.subscribe(modifiers => this.modify(modifiers));
    }
}