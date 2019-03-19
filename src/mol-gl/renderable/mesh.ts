/**
 * Copyright (c) 2018 mol* contributors, licensed under MIT, See LICENSE file for more info.
 *
 * @author Alexander Rose <alexander.rose@weirdbyte.de>
 */

import { Renderable, RenderableState, createRenderable } from '../renderable'
import { WebGLContext } from '../webgl/context';
import { createRenderItem } from '../webgl/render-item';
import { GlobalUniformSchema, BaseSchema, AttributeSpec, ElementsSpec, DefineSpec, Values, InternalSchema, InternalValues } from './schema';
import { MeshShaderCode } from '../shader-code';
import { ValueCell } from 'mol-util';

export const MeshSchema = {
    ...BaseSchema,
    aPosition: AttributeSpec('float32', 3, 0),
    aNormal: AttributeSpec('float32', 3, 0),
    elements: ElementsSpec('uint32'),
    dFlatShaded: DefineSpec('boolean'),
    dDoubleSided: DefineSpec('boolean'),
    dFlipSided: DefineSpec('boolean'),
}
export type MeshSchema = typeof MeshSchema
export type MeshValues = Values<MeshSchema>

export function MeshRenderable(ctx: WebGLContext, id: number, values: MeshValues, state: RenderableState, materialId: number): Renderable<MeshValues> {
    const schema = { ...GlobalUniformSchema, ...InternalSchema, ...MeshSchema }
    const internalValues: InternalValues = {
        uObjectId: ValueCell.create(id),
        uPickable: ValueCell.create(state.pickable ? 1 : 0)
    }
    const shaderCode = MeshShaderCode
    const renderItem = createRenderItem(ctx, 'triangles', shaderCode, schema, { ...values, ...internalValues }, materialId)

    return createRenderable(renderItem, values, state)
}