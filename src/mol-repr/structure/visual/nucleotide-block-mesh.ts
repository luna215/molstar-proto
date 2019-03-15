/**
 * Copyright (c) 2018 mol* contributors, licensed under MIT, See LICENSE file for more info.
 *
 * @author Alexander Rose <alexander.rose@weirdbyte.de>
 */

import { Unit, Structure, ElementIndex } from 'mol-model/structure';
import { UnitsVisual } from '../representation';
import { Vec3, Mat4 } from 'mol-math/linear-algebra';
import { Segmentation } from 'mol-data/int';
import { isNucleic, isPurinBase, isPyrimidineBase } from 'mol-model/structure/model/types';
import { UnitsMeshVisual, UnitsMeshParams } from '../units-visual';
import { NucleotideLocationIterator, eachNucleotideElement, getNucleotideElementLoci } from './util/nucleotide';
import { ParamDefinition as PD } from 'mol-util/param-definition';
import { Box } from 'mol-geo/primitive/box';
import { Mesh } from 'mol-geo/geometry/mesh/mesh';
import { MeshBuilder } from 'mol-geo/geometry/mesh/mesh-builder';
import { addCylinder } from 'mol-geo/geometry/mesh/builder/cylinder';
import { VisualContext } from 'mol-repr/visual';
import { Theme } from 'mol-theme/theme';
import { VisualUpdateState } from 'mol-repr/util';
import { CylinderProps } from 'mol-geo/primitive/cylinder';

const p1 = Vec3.zero()
const p2 = Vec3.zero()
const p3 = Vec3.zero()
const p4 = Vec3.zero()
const p5 = Vec3.zero()
const p6 = Vec3.zero()
const v12 = Vec3.zero()
const v34 = Vec3.zero()
const vC = Vec3.zero()
const center = Vec3.zero()
const t = Mat4.identity()
const sVec = Vec3.zero()
const box = Box()

export const NucleotideBlockMeshParams = {
    sizeFactor: PD.Numeric(0.2, { min: 0, max: 10, step: 0.01 }),
    radialSegments: PD.Numeric(16, { min: 3, max: 56, step: 1 }),
}
export const DefaultNucleotideBlockMeshProps = PD.getDefaultValues(NucleotideBlockMeshParams)
export type NucleotideBlockMeshProps = typeof DefaultNucleotideBlockMeshProps

function createNucleotideBlockMesh(ctx: VisualContext, unit: Unit, structure: Structure, theme: Theme, props: NucleotideBlockMeshProps, mesh?: Mesh) {
    if (!Unit.isAtomic(unit)) return Mesh.createEmpty(mesh)

    const nucleotideElementCount = unit.nucleotideElements.length
    if (!nucleotideElementCount) return Mesh.createEmpty(mesh)

    const { sizeFactor, radialSegments } = props

    const vertexCount = nucleotideElementCount * (box.vertices.length / 3 + radialSegments * 2)
    const builderState = MeshBuilder.createState(vertexCount, vertexCount / 4, mesh)

    const { elements, model } = unit
    const { modifiedResidues } = model.properties
    const { chainAtomSegments, residueAtomSegments, residues, index: atomicIndex } = model.atomicHierarchy
    const { moleculeType, traceElementIndex } = model.atomicHierarchy.derived.residue
    const { label_comp_id } = residues
    const pos = unit.conformation.invariantPosition

    const chainIt = Segmentation.transientSegments(chainAtomSegments, elements)
    const residueIt = Segmentation.transientSegments(residueAtomSegments, elements)

    const cylinderProps: CylinderProps = { radiusTop: 1 * sizeFactor, radiusBottom: 1 * sizeFactor, radialSegments }

    let i = 0
    while (chainIt.hasNext) {
        residueIt.setSegment(chainIt.move());

        while (residueIt.hasNext) {
            const { index: residueIndex } = residueIt.move();

            if (isNucleic(moleculeType[residueIndex])) {
                let compId = label_comp_id.value(residueIndex)
                const parentId = modifiedResidues.parentId.get(compId)
                if (parentId !== undefined) compId = parentId
                let idx1: ElementIndex | -1 = -1, idx2: ElementIndex | -1 = -1, idx3: ElementIndex | -1 = -1, idx4: ElementIndex | -1 = -1, idx5: ElementIndex | -1 = -1, idx6: ElementIndex | -1 = -1
                let width = 4.5, height = 4.5, depth = 2.5 * sizeFactor

                if (isPurinBase(compId)) {
                    height = 4.5
                    idx1 = atomicIndex.findAtomOnResidue(residueIndex, 'N1')
                    idx2 = atomicIndex.findAtomOnResidue(residueIndex, 'C4')
                    idx3 = atomicIndex.findAtomOnResidue(residueIndex, 'C6')
                    idx4 = atomicIndex.findAtomOnResidue(residueIndex, 'C2')
                    idx5 = atomicIndex.findAtomOnResidue(residueIndex, 'N9')
                    idx6 = traceElementIndex[residueIndex]
                } else if (isPyrimidineBase(compId)) {
                    height = 3.0
                    idx1 = atomicIndex.findAtomOnResidue(residueIndex, 'N3')
                    idx2 = atomicIndex.findAtomOnResidue(residueIndex, 'C6')
                    idx3 = atomicIndex.findAtomOnResidue(residueIndex, 'C4')
                    idx4 = atomicIndex.findAtomOnResidue(residueIndex, 'C2')
                    idx5 = atomicIndex.findAtomOnResidue(residueIndex, 'N1')
                    idx6 = traceElementIndex[residueIndex]
                }

                if (idx5 !== -1 && idx6 !== -1) {
                    pos(idx5, p5); pos(idx6, p6)
                    builderState.currentGroup = i
                    addCylinder(builderState, p5, p6, 1, cylinderProps)
                    if (idx1 !== -1 && idx2 !== -1 && idx3 !== -1 && idx4 !== -1) {
                        pos(idx1, p1); pos(idx2, p2); pos(idx3, p3); pos(idx4, p4);
                        Vec3.normalize(v12, Vec3.sub(v12, p2, p1))
                        Vec3.normalize(v34, Vec3.sub(v34, p4, p3))
                        Vec3.normalize(vC, Vec3.cross(vC, v12, v34))
                        Mat4.targetTo(t, p1, p2, vC)
                        Vec3.scaleAndAdd(center, p1, v12, height / 2 - 0.2)
                        Mat4.scale(t, t, Vec3.set(sVec, width, depth, height))
                        Mat4.setTranslation(t, center)
                        MeshBuilder.addPrimitive(builderState, t, box)
                    }
                }

                ++i
            }
        }
    }

    return MeshBuilder.getMesh(builderState)
}

export const NucleotideBlockParams = {
    ...UnitsMeshParams,
    ...NucleotideBlockMeshParams
}
export type NucleotideBlockParams = typeof NucleotideBlockParams

export function NucleotideBlockVisual(): UnitsVisual<NucleotideBlockParams> {
    return UnitsMeshVisual<NucleotideBlockParams>({
        defaultProps: PD.getDefaultValues(NucleotideBlockParams),
        createGeometry: createNucleotideBlockMesh,
        createLocationIterator: NucleotideLocationIterator.fromGroup,
        getLoci: getNucleotideElementLoci,
        eachLocation: eachNucleotideElement,
        setUpdateState: (state: VisualUpdateState, newProps: PD.Values<NucleotideBlockParams>, currentProps: PD.Values<NucleotideBlockParams>) => {
            state.createGeometry = (
                newProps.sizeFactor !== currentProps.sizeFactor ||
                newProps.radialSegments !== currentProps.radialSegments
            )
        }
    })
}