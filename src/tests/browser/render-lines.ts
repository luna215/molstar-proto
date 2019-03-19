/**
 * Copyright (c) 2019 mol* contributors, licensed under MIT, See LICENSE file for more info.
 *
 * @author Alexander Rose <alexander.rose@weirdbyte.de>
 */

import './index.html'
import { Canvas3D } from 'mol-canvas3d/canvas3d';
import { Mat4 } from 'mol-math/linear-algebra';
import { Representation } from 'mol-repr/representation';
import { Color } from 'mol-util/color';
import { createRenderObject } from 'mol-gl/render-object';
import { Lines } from 'mol-geo/geometry/lines/lines';
import { LinesBuilder } from 'mol-geo/geometry/lines/lines-builder';
import { DodecahedronCage } from 'mol-geo/primitive/dodecahedron';

const parent = document.getElementById('app')!
parent.style.width = '100%'
parent.style.height = '100%'

const canvas = document.createElement('canvas')
canvas.style.width = '100%'
canvas.style.height = '100%'
parent.appendChild(canvas)

const canvas3d = Canvas3D.create(canvas, parent)
canvas3d.animate()

function linesRepr() {
    const linesBuilder = LinesBuilder.create()
    const t = Mat4.identity()
    const dodecahedronCage = DodecahedronCage()
    linesBuilder.addCage(t, dodecahedronCage, 0)
    const lines = linesBuilder.getLines()

    const values = Lines.Utils.createValuesSimple(lines, {}, Color(0xFF0000), 3)
    const state = Lines.Utils.createRenderableState({})
    const renderObject = createRenderObject('lines', values, state, -1)
    const repr = Representation.fromRenderObject('cage-lines', renderObject)
    return repr
}

canvas3d.add(linesRepr())
canvas3d.resetCamera()