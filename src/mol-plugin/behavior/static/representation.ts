/**
 * Copyright (c) 2018 mol* contributors, licensed under MIT, See LICENSE file for more info.
 *
 * @author David Sehnal <david.sehnal@gmail.com>
 */

import { PluginStateObject as SO } from '../../state/objects';
import { PluginContext } from 'mol-plugin/context';
import { Representation } from 'mol-repr/representation';
import { State } from 'mol-state';

export function registerDefault(ctx: PluginContext) {
    SyncRepresentationToCanvas(ctx);
    UpdateRepresentationVisibility(ctx);
}

export function SyncRepresentationToCanvas(ctx: PluginContext) {
    let reprCount = 0;

    const events = ctx.state.dataState.events;
    events.object.created.subscribe(e => {
        if (!SO.isRepresentation3D(e.obj)) return;
        updateVisibility(e, e.obj.data);
        e.obj.data.setState({ syncManually: true });
        ctx.canvas3d.add(e.obj.data);

        if (reprCount === 0) ctx.canvas3d.resetCamera();
        reprCount++;
    });
    events.object.updated.subscribe(e => {
        if (e.oldObj && SO.isRepresentation3D(e.oldObj)) {
            ctx.canvas3d.remove(e.oldObj.data);
            ctx.canvas3d.requestDraw(true);
            e.oldObj.data.destroy();
        }

        if (!SO.isRepresentation3D(e.obj)) {
            return;
        }

        updateVisibility(e, e.obj.data);
        if (e.action === 'recreate') {
            e.obj.data.setState({ syncManually: true });
        }
        ctx.canvas3d.add(e.obj.data);
    });
    events.object.removed.subscribe(e => {
        if (!SO.isRepresentation3D(e.obj)) return;
        ctx.canvas3d.remove(e.obj.data);
        ctx.canvas3d.requestDraw(true);
        e.obj.data.destroy();
        reprCount--;
    });
}

export function UpdateRepresentationVisibility(ctx: PluginContext) {
    ctx.state.dataState.events.cell.stateUpdated.subscribe(e => {
        const cell = e.state.cells.get(e.ref)!;
        if (!SO.isRepresentation3D(cell.obj)) return;
        updateVisibility(e, cell.obj.data);
        ctx.canvas3d.requestDraw(true);
    })
}

function updateVisibility(e: State.ObjectEvent, r: Representation<any>) {
    r.setState({ visible: !e.state.cellStates.get(e.ref).isHidden });
}