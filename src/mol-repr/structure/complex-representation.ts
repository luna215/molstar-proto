/**
 * Copyright (c) 2018 mol* contributors, licensed under MIT, See LICENSE file for more info.
 *
 * @author Alexander Rose <alexander.rose@weirdbyte.de>
 * @author David Sehnal <david.sehnal@gmail.com>
 */

import { Structure } from 'mol-model/structure';
import { Task } from 'mol-task'
import { Loci, EmptyLoci } from 'mol-model/loci';
import { StructureProps, StructureRepresentation, StructureParams } from './index';
import { ComplexVisual } from './complex-visual';
import { PickingId } from 'mol-geo/geometry/picking';
import { MarkerAction } from 'mol-geo/geometry/marker-data';
import { RepresentationContext } from 'mol-repr';
import { createTheme, Theme } from 'mol-geo/geometry/geometry';

export function ComplexRepresentation<P extends StructureProps>(label: string, visualCtor: () => ComplexVisual<P>): StructureRepresentation<P> {
    let visual: ComplexVisual<P> | undefined
    let _structure: Structure
    let _props: P
    let _theme: Theme

    function createOrUpdate(ctx: RepresentationContext, props: Partial<P> = {}, structure?: Structure) {
        if (structure) _structure = structure
        _props = Object.assign({}, _props, props, { structure: _structure })
        _theme = createTheme(_props)

        return Task.create('Creating or updating ComplexRepresentation', async runtime => {
            if (!visual) visual = visualCtor()
            await visual.createOrUpdate({ ...ctx, runtime }, _theme, _props, structure)
        });
    }

    function getLoci(pickingId: PickingId) {
        return visual ? visual.getLoci(pickingId) : EmptyLoci
    }

    function mark(loci: Loci, action: MarkerAction) {
        return visual ? visual.mark(loci, action) : false
    }

    function destroy() {
        if (visual) visual.destroy()
    }

    return {
        label,
        params: StructureParams, // TODO
        get renderObjects() {
            return visual && visual.renderObject ? [ visual.renderObject ] : []
        },
        get props() { return _props },
        createOrUpdate,
        getLoci,
        mark,
        destroy
    }
}