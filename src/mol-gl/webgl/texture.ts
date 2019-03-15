/**
 * Copyright (c) 2018 mol* contributors, licensed under MIT, See LICENSE file for more info.
 *
 * @author Alexander Rose <alexander.rose@weirdbyte.de>
 */

import { WebGLContext } from './context'
import { TextureImage, TextureVolume } from '../renderable/util';
import { ValueCell } from 'mol-util';
import { RenderableSchema } from '../renderable/schema';
import { idFactory } from 'mol-util/id-factory';
import { Framebuffer } from './framebuffer';
import { isWebGL2 } from './compat';
import { ValueOf } from 'mol-util/type-helpers';

const getNextTextureId = idFactory()

export type TextureKindValue = {
    'image-uint8': TextureImage<Uint8Array>
    'image-float32': TextureImage<Float32Array>
    'volume-uint8': TextureVolume<Uint8Array>
    'volume-float32': TextureVolume<Float32Array>
    'texture': Texture
}
export type TextureValueType = ValueOf<TextureKindValue>
export type TextureKind = keyof TextureKindValue
export type TextureType = 'ubyte' | 'float'
export type TextureFormat = 'alpha' | 'rgb' | 'rgba'
/** Numbers are shortcuts for color attachment */
export type TextureAttachment = 'depth' | 'stencil' | 'color0' | 'color1' | 'color2' | 'color3' | 'color4' | 'color5' | 'color6' | 'color7' | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7
export type TextureFilter = 'nearest' | 'linear'

export function getTarget(ctx: WebGLContext, kind: TextureKind): number {
    const { gl } = ctx
    switch (kind) {
        case 'image-uint8': return gl.TEXTURE_2D
        case 'image-float32': return gl.TEXTURE_2D
    }
    if (isWebGL2(gl)) {
        switch (kind) {
            case 'volume-uint8': return gl.TEXTURE_3D
            case 'volume-float32': return gl.TEXTURE_3D
        }
    }
    throw new Error('unknown texture kind')
}

export function getFormat(ctx: WebGLContext, format: TextureFormat): number {
    const { gl } = ctx
    switch (format) {
        case 'alpha': return gl.ALPHA
        case 'rgb': return gl.RGB
        case 'rgba': return gl.RGBA
    }
}

export function getInternalFormat(ctx: WebGLContext, format: TextureFormat, type: TextureType): number {
    const { gl, isWebGL2 } = ctx
    if (isWebGL2) {
        switch (format) {
            case 'alpha':
                switch (type) {
                    case 'ubyte': return gl.ALPHA
                    case 'float': throw new Error('invalid format/type combination alpha/float')
                }
            case 'rgb':
                switch (type) {
                    case 'ubyte': return gl.RGB
                    case 'float': return (gl as WebGL2RenderingContext).RGB32F
                }
            case 'rgba':
                switch (type) {
                    case 'ubyte': return gl.RGBA
                    case 'float': return (gl as WebGL2RenderingContext).RGBA32F
                }
        }
    }
    return getFormat(ctx, format)
}

export function getType(ctx: WebGLContext, type: TextureType): number {
    const { gl } = ctx
    switch (type) {
        case 'ubyte': return gl.UNSIGNED_BYTE
        case 'float': return gl.FLOAT
    }
}

export function getFilter(ctx: WebGLContext, type: TextureFilter): number {
    const { gl } = ctx
    switch (type) {
        case 'nearest': return gl.NEAREST
        case 'linear': return gl.LINEAR
    }
}

export function getAttachment(ctx: WebGLContext, attachment: TextureAttachment): number {
    const { gl } = ctx
    switch (attachment) {
        case 'depth': return gl.DEPTH_ATTACHMENT
        case 'stencil': return gl.STENCIL_ATTACHMENT
        case 'color0': case 0: return gl.COLOR_ATTACHMENT0
    }
    if (isWebGL2(gl)) {
        switch (attachment) {
            case 'color1': case 1: return gl.COLOR_ATTACHMENT1
            case 'color2': case 2: return gl.COLOR_ATTACHMENT2
            case 'color3': case 3: return gl.COLOR_ATTACHMENT3
            case 'color4': case 4: return gl.COLOR_ATTACHMENT4
            case 'color5': case 5: return gl.COLOR_ATTACHMENT5
            case 'color6': case 6: return gl.COLOR_ATTACHMENT6
            case 'color7': case 7: return gl.COLOR_ATTACHMENT7
        }
    }
    throw new Error('unknown texture attachment')
}

export interface Texture {
    readonly id: number
    readonly target: number
    readonly format: number
    readonly internalFormat: number
    readonly type: number

    readonly width: number
    readonly height: number
    readonly depth: number

    define: (width: number, height: number, depth?: number) => void
    load: (image: TextureImage<any> | TextureVolume<any>) => void
    bind: (id: TextureId) => void
    unbind: (id: TextureId) => void
    /** Use `layer` to attach a z-slice of a 3D texture */
    attachFramebuffer: (framebuffer: Framebuffer, attachment: TextureAttachment, layer?: number) => void
    detachFramebuffer: (framebuffer: Framebuffer, attachment: TextureAttachment) => void
    destroy: () => void
}

export type TextureId = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15

export type TextureValues = { [k: string]: ValueCell<TextureValueType> }
export type Textures = { [k: string]: Texture }

export function createTexture(ctx: WebGLContext, kind: TextureKind, _format: TextureFormat, _type: TextureType, _filter: TextureFilter): Texture {
    const id = getNextTextureId()
    const { gl } = ctx
    const texture = gl.createTexture()
    if (texture === null) {
        throw new Error('Could not create WebGL texture')
    }

    const target = getTarget(ctx, kind)
    const filter = getFilter(ctx, _filter)
    const format = getFormat(ctx, _format)
    const internalFormat = getInternalFormat(ctx, _format, _type)
    const type = getType(ctx, _type)

    gl.bindTexture(target, texture)
    gl.texParameteri(target, gl.TEXTURE_MAG_FILTER, filter)
    gl.texParameteri(target, gl.TEXTURE_MIN_FILTER, filter)
    // clamp-to-edge needed for non-power-of-two textures in webgl
    gl.texParameteri(target, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(target, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindTexture(target, null)

    let width = 0, height = 0, depth = 0

    let destroyed = false
    ctx.textureCount += 1

    return {
        id,
        target,
        format,
        internalFormat,
        type,

        get width () { return width },
        get height () { return height },
        get depth () { return depth },

        define: (_width: number, _height: number, _depth?: number) => {
            width = _width, height = _height, depth = _depth || 0
            gl.bindTexture(target, texture)
            if (target === gl.TEXTURE_2D) {
                gl.texImage2D(target, 0, internalFormat, width, height, 0, format, type, null)
            } else if (target === (gl as WebGL2RenderingContext).TEXTURE_3D && depth !== undefined) {
                (gl as WebGL2RenderingContext).texImage3D(target, 0, internalFormat, width, height, depth, 0, format, type, null)
            } else {
                throw new Error('unknown texture target')
            }
        },
        load: (data: TextureImage<any> | TextureVolume<any>) => {
            gl.bindTexture(target, texture)
            // unpack alignment of 1 since we use textures only for data
            gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
            gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
            gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, 0);
            if (target === gl.TEXTURE_2D) {
                const { array, width: _width, height: _height } = data as TextureImage<any>
                width = _width, height = _height;
                gl.texImage2D(target, 0, internalFormat, width, height, 0, format, type, array)
            } else if (target === (gl as WebGL2RenderingContext).TEXTURE_3D) {
                const { array, width: _width, height: _height, depth: _depth } = data as TextureVolume<any>
                width = _width, height = _height, depth = _depth;
                (gl as WebGL2RenderingContext).texImage3D(target, 0, internalFormat, width, height, depth, 0, format, type, array)
            } else {
                throw new Error('unknown texture target')
            }
            gl.bindTexture(target, null)
        },
        bind: (id: TextureId) => {
            gl.activeTexture(gl.TEXTURE0 + id)
            gl.bindTexture(target, texture)
        },
        unbind: (id: TextureId) => {
            gl.activeTexture(gl.TEXTURE0 + id)
            gl.bindTexture(target, null)
        },
        attachFramebuffer: (framebuffer: Framebuffer, attachment: TextureAttachment, layer?: number) => {
            framebuffer.bind()
            if (target === (gl as WebGL2RenderingContext).TEXTURE_3D) {
                if (layer === undefined) throw new Error('need `layer` to attach 3D texture');
                (gl as WebGL2RenderingContext).framebufferTextureLayer(gl.FRAMEBUFFER, getAttachment(ctx, attachment), texture, 0, layer)
            } else {
                gl.framebufferTexture2D(gl.FRAMEBUFFER, getAttachment(ctx, attachment), gl.TEXTURE_2D, texture, 0)
            }
        },
        detachFramebuffer: (framebuffer: Framebuffer, attachment: TextureAttachment) => {
            framebuffer.bind()
            if (target === (gl as WebGL2RenderingContext).TEXTURE_3D) {
                (gl as WebGL2RenderingContext).framebufferTextureLayer(gl.FRAMEBUFFER, getAttachment(ctx, attachment), null, 0, 0)
            } else {
                gl.framebufferTexture2D(gl.FRAMEBUFFER, getAttachment(ctx, attachment), gl.TEXTURE_2D, null, 0)
            }
        },
        destroy: () => {
            if (destroyed) return
            gl.deleteTexture(texture)
            destroyed = true
            ctx.textureCount -= 1
        }
    }
}

export function createTextures(ctx: WebGLContext, schema: RenderableSchema, values: TextureValues) {
    const textures: Textures = {}
    Object.keys(schema).forEach((k, i) => {
        const spec = schema[k]
        if (spec.type === 'texture') {
            if (spec.kind === 'texture') {
                textures[k] = values[k].ref.value as Texture
            } else {
                const texture = createTexture(ctx, spec.kind, spec.format, spec.dataType, spec.filter)
                texture.load(values[k].ref.value as TextureImage<any> | TextureVolume<any>)
                textures[k] = texture
            }
        }
    })
    return textures
}