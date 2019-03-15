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
    SyncStructureRepresentation3DState(ctx); // should be AFTER SyncRepresentationToCanvas
    UpdateRepresentationVisibility(ctx);
}

export function SyncRepresentationToCanvas(ctx: PluginContext) {
    let reprCount = 0;

    const events = ctx.state.dataState.events;
    events.object.created.subscribe(e => {
        if (!SO.isRepresentation3D(e.obj)) return;
        updateVisibility(e, e.obj.data.repr);
        e.obj.data.repr.setState({ syncManually: true });
        ctx.canvas3d.add(e.obj.data.repr);

        if (reprCount === 0) ctx.canvas3d.resetCamera();
        reprCount++;
    });
    events.object.updated.subscribe(e => {
        if (e.oldObj && SO.isRepresentation3D(e.oldObj)) {
            ctx.canvas3d.remove(e.oldObj.data.repr);
            ctx.canvas3d.requestDraw(true);
            e.oldObj.data.repr.destroy();
        }

        if (!SO.isRepresentation3D(e.obj)) {
            return;
        }

        updateVisibility(e, e.obj.data.repr);
        if (e.action === 'recreate') {
            e.obj.data.repr.setState({ syncManually: true });
        }
        ctx.canvas3d.add(e.obj.data.repr);
    });
    events.object.removed.subscribe(e => {
        if (!SO.isRepresentation3D(e.obj)) return;
        ctx.canvas3d.remove(e.obj.data.repr);
        ctx.canvas3d.requestDraw(true);
        e.obj.data.repr.destroy();
        reprCount--;
    });
}


export function SyncStructureRepresentation3DState(ctx: PluginContext) {
    // TODO: figure out how to do transform composition here?
    const events = ctx.state.dataState.events;
    events.object.created.subscribe(e => {
        if (!SO.Molecule.Structure.Representation3DState.is(e.obj)) return;
        const data = e.obj.data as SO.Molecule.Structure.Representation3DStateData;
        data.source.data.repr.setState(data.state);
        ctx.canvas3d.update(data.source.data.repr);
        ctx.canvas3d.requestDraw(true);
    });
    events.object.updated.subscribe(e => {
        if (!SO.Molecule.Structure.Representation3DState.is(e.obj)) return;
        const data = e.obj.data as SO.Molecule.Structure.Representation3DStateData;
        data.source.data.repr.setState(data.state);
        ctx.canvas3d.update(data.source.data.repr);
        ctx.canvas3d.requestDraw(true);
    });
    events.object.removed.subscribe(e => {
        if (!SO.Molecule.Structure.Representation3DState.is(e.obj)) return;
        const data = e.obj.data as SO.Molecule.Structure.Representation3DStateData;
        data.source.data.repr.setState(data.initialState);
        ctx.canvas3d.update(data.source.data.repr);
        ctx.canvas3d.requestDraw(true);
    });
}


export function UpdateRepresentationVisibility(ctx: PluginContext) {
    ctx.state.dataState.events.cell.stateUpdated.subscribe(e => {
        const cell = e.state.cells.get(e.ref)!;
        if (!SO.isRepresentation3D(cell.obj)) return;
        updateVisibility(e, cell.obj.data.repr);
        ctx.canvas3d.requestDraw(true);
    })
}

function updateVisibility(e: State.ObjectEvent, r: Representation<any>) {
    r.setState({ visible: !e.state.cellStates.get(e.ref).isHidden });
}