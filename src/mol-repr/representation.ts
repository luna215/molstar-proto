/**
 * Copyright (c) 2018 mol* contributors, licensed under MIT, See LICENSE file for more info.
 *
 * @author Alexander Rose <alexander.rose@weirdbyte.de>
 */

import { Task } from 'mol-task'
import { RenderObject } from 'mol-gl/render-object'
import { PickingId } from '../mol-geo/geometry/picking';
import { Loci, isEmptyLoci, EmptyLoci } from 'mol-model/loci';
import { MarkerAction } from '../mol-geo/geometry/marker-data';
import { ParamDefinition as PD } from 'mol-util/param-definition';
import { WebGLContext } from 'mol-gl/webgl/context';
import { getQualityProps } from './util';
import { ColorTheme } from 'mol-theme/color';
import { SizeTheme } from 'mol-theme/size';
import { Theme, ThemeRegistryContext, createEmptyTheme } from 'mol-theme/theme';
import { Subject } from 'rxjs';
import { Mat4 } from 'mol-math/linear-algebra';

// export interface RepresentationProps {
//     visuals?: string[]
// }
export type RepresentationProps = { [k: string]: any }

export interface RepresentationContext {
    readonly webgl?: WebGLContext
    readonly colorThemeRegistry: ColorTheme.Registry
    readonly sizeThemeRegistry: SizeTheme.Registry
}

export type RepresentationParamsGetter<D, P extends PD.Params> = (ctx: ThemeRegistryContext, data: D) => P
export type RepresentationFactory<D, P extends PD.Params> = (ctx: RepresentationContext, getParams: RepresentationParamsGetter<D, P>) => Representation<D, P>

//

export interface RepresentationProvider<D, P extends PD.Params> {
    readonly label: string
    readonly description: string
    readonly factory: RepresentationFactory<D, P>
    readonly getParams: RepresentationParamsGetter<D, P>
    readonly defaultValues: PD.Values<P>
    readonly defaultColorTheme: string
    readonly defaultSizeTheme: string
}

export type AnyRepresentationProvider = RepresentationProvider<any, {}>

export const EmptyRepresentationProvider = {
    label: '',
    description: '',
    factory: () => Representation.Empty,
    getParams: () => ({}),
    defaultValues: {}
}

export class RepresentationRegistry<D> {
    private _list: { name: string, provider: RepresentationProvider<D, any> }[] = []
    private _map = new Map<string, RepresentationProvider<D, any>>()

    get default() { return this._list[0]; }
    get types(): [string, string][] {
        return this._list.map(e => [e.name, e.provider.label] as [string, string]);
    }

    constructor() {};

    add<P extends PD.Params>(name: string, provider: RepresentationProvider<D, P>) {
        this._list.push({ name, provider })
        this._map.set(name, provider)
    }

    remove(name: string) {
        this._list.splice(this._list.findIndex(e => e.name === name), 1)
        this._map.delete(name)
    }

    get<P extends PD.Params>(name: string): RepresentationProvider<D, P> {
        return this._map.get(name) || EmptyRepresentationProvider as unknown as RepresentationProvider<D, P>
    }

    get list() {
        return this._list
    }
}

//

export { Representation }
interface Representation<D, P extends PD.Params = {}> {
    readonly label: string
    readonly updated: Subject<number>
    /** Number of addressable groups in all visuals of the representation */
    readonly groupCount: number
    readonly renderObjects: ReadonlyArray<RenderObject>
    readonly props: Readonly<PD.Values<P>>
    readonly params: Readonly<P>
    readonly state: Readonly<Representation.State>
    readonly theme: Readonly<Theme>
    createOrUpdate: (props?: Partial<PD.Values<P>>, data?: D) => Task<void>
    setState: (state: Partial<Representation.State>) => void
    setTheme: (theme: Theme) => void
    getLoci: (pickingId: PickingId) => Loci
    mark: (loci: Loci, action: MarkerAction) => boolean
    destroy: () => void
}
namespace Representation {
    export interface State {
        /** Controls if the representation's renderobjects are rendered or not */
        visible: boolean
        /** Controls if the representation's renderobjects are pickable or not */
        pickable: boolean
        /** Controls if the representation's renderobjects are synced automatically with GPU or not */
        syncManually: boolean
        /** A transformation applied to the representation's renderobjects */
        transform: Mat4
    }
    export function createState() {
        return { visible: false, pickable: false, syncManually: false, transform: Mat4.identity() }
    }
    export function updateState(state: State, update: Partial<State>) {
        if (update.visible !== undefined) state.visible = update.visible
        if (update.pickable !== undefined) state.pickable = update.pickable
        if (update.syncManually !== undefined) state.syncManually = update.syncManually
        if (update.transform !== undefined) Mat4.copy(state.transform, update.transform)
    }

    export type Any = Representation<any>
    export const Empty: Any = {
        label: '', groupCount: 0, renderObjects: [], props: {}, params: {}, updated: new Subject(), state: createState(), theme: createEmptyTheme(),
        createOrUpdate: () => Task.constant('', undefined),
        setState: () => {},
        setTheme: () => {},
        getLoci: () => EmptyLoci,
        mark: () => false,
        destroy: () => {}
    }

    export type Def<D, P extends PD.Params = {}> = { [k: string]: RepresentationFactory<D, P> }

    export function createMulti<D, P extends PD.Params = {}>(label: string, ctx: RepresentationContext, getParams: RepresentationParamsGetter<D, P>, reprDefs: Def<D, P>): Representation<D, P> {
        let version = 0
        const updated = new Subject<number>()
        const currentState = Representation.createState()
        let currentTheme = createEmptyTheme()

        let currentParams: P
        let currentProps: PD.Values<P>
        let currentData: D

        const reprMap: { [k: number]: string } = {}
        const reprList: Representation<D, P>[] = Object.keys(reprDefs).map((name, i) => {
            reprMap[i] = name
            return reprDefs[name](ctx, getParams)
        })

        return {
            label,
            updated,
            get groupCount() {
                let groupCount = 0
                if (currentProps) {
                    const { visuals } = currentProps
                    for (let i = 0, il = reprList.length; i < il; ++i) {
                        if (!visuals || visuals.includes(reprMap[i])) {
                            groupCount += reprList[i].groupCount
                        }
                    }
                }
                return groupCount
            },
            get renderObjects() {
                const renderObjects: RenderObject[] = []
                if (currentProps) {
                    const { visuals } = currentProps
                    for (let i = 0, il = reprList.length; i < il; ++i) {
                        if (!visuals || visuals.includes(reprMap[i])) {
                            renderObjects.push(...reprList[i].renderObjects)
                        }
                    }
                }
                return renderObjects
            },
            get props() {
                const props = {}
                reprList.forEach(r => Object.assign(props, r.props))
                return props as P
            },
            get params() { return currentParams },
            createOrUpdate: (props: Partial<P> = {}, data?: D) => {
                if (data && data !== currentData) {
                    currentParams = getParams(ctx, data)
                    currentData = data
                    if (!currentProps) currentProps = PD.getDefaultValues(currentParams) as P
                }
                const qualityProps = getQualityProps(Object.assign({}, currentProps, props), currentData)
                Object.assign(currentProps, props, qualityProps)

                const { visuals } = currentProps
                return Task.create(`Creating '${label}' representation`, async runtime => {
                    for (let i = 0, il = reprList.length; i < il; ++i) {
                        if (!visuals || visuals.includes(reprMap[i])) {
                            await reprList[i].createOrUpdate(currentProps, currentData).runInContext(runtime)
                        }
                    }
                    updated.next(version++)
                })
            },
            get state() { return currentState },
            get theme() { return currentTheme },
            getLoci: (pickingId: PickingId) => {
                for (let i = 0, il = reprList.length; i < il; ++i) {
                    const loci = reprList[i].getLoci(pickingId)
                    if (!isEmptyLoci(loci)) return loci
                }
                return EmptyLoci
            },
            mark: (loci: Loci, action: MarkerAction) => {
                let marked = false
                for (let i = 0, il = reprList.length; i < il; ++i) {
                    marked = reprList[i].mark(loci, action) || marked
                }
                return marked
            },
            setState: (state: Partial<State>) => {
                for (let i = 0, il = reprList.length; i < il; ++i) {
                    reprList[i].setState(state)
                }
                Representation.updateState(currentState, state)
            },
            setTheme: (theme: Theme) => {
                for (let i = 0, il = reprList.length; i < il; ++i) {
                    reprList[i].setTheme(theme)
                }
            },
            destroy() {
                for (let i = 0, il = reprList.length; i < il; ++i) {
                    reprList[i].destroy()
                }
            }
        }
    }
}