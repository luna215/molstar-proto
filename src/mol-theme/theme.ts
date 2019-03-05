/**
 * Copyright (c) 2018 mol* contributors, licensed under MIT, See LICENSE file for more info.
 *
 * @author Alexander Rose <alexander.rose@weirdbyte.de>
 */

import { ColorTheme } from './color';
import { SizeTheme } from './size';
import { Structure } from 'mol-model/structure';
import { VolumeData } from 'mol-model/volume';
import { ParamDefinition as PD } from 'mol-util/param-definition';
import { Shape } from 'mol-model/shape';

export interface ThemeRegistryContext {
    colorThemeRegistry: ColorTheme.Registry
    sizeThemeRegistry: SizeTheme.Registry
}

export interface ThemeDataContext {
    [k: string]: any
    structure?: Structure
    volume?: VolumeData
    shape?: Shape
}

export interface Theme {
    color: ColorTheme<any>
    size: SizeTheme<any>
    // label: LabelTheme // TODO
}

type Props = { [k: string]: any }

export function createTheme(ctx: ThemeRegistryContext, data: ThemeDataContext, props: Props, theme?: Theme) {
    theme = theme || createEmptyTheme()

    const colorProps = props.colorTheme as PD.NamedParams
    const sizeProps = props.sizeTheme as PD.NamedParams

    theme.color = ctx.colorThemeRegistry.create(colorProps.name, data, colorProps.params)
    theme.size = ctx.sizeThemeRegistry.create(sizeProps.name, data, sizeProps.params)

    return theme
}

export function createEmptyTheme(): Theme {
    return { color: ColorTheme.Empty, size: SizeTheme.Empty }
}

//

export interface ThemeProvider<T extends ColorTheme<P> | SizeTheme<P>, P extends PD.Params> {
    readonly label: string
    readonly factory: (ctx: ThemeDataContext, props: PD.Values<P>) => T
    readonly getParams: (ctx: ThemeDataContext) => P
    readonly defaultValues: PD.Values<P>
    readonly isApplicable: (ctx: ThemeDataContext) => boolean
}

function getTypes(list: { name: string, provider: ThemeProvider<any, any> }[]) {
    return list.map(e => [e.name, e.provider.label] as [string, string]);
}

export class ThemeRegistry<T extends ColorTheme<any> | SizeTheme<any>> {
    private _list: { name: string, provider: ThemeProvider<T, any> }[] = []
    private _map = new Map<string, ThemeProvider<T, any>>()
    private _name = new Map<ThemeProvider<T, any>, string>()

    get default() { return this._list[0]; }
    get list() { return this._list }
    get types(): [string, string][] { return getTypes(this._list) }

    constructor(builtInThemes: { [k: string]: ThemeProvider<T, any> }, private emptyProvider: ThemeProvider<T, any>) {
        Object.keys(builtInThemes).forEach(name => this.add(name, builtInThemes[name]))
    }

    add<P extends PD.Params>(name: string, provider: ThemeProvider<T, P>) {
        this._list.push({ name, provider })
        this._map.set(name, provider)
        this._name.set(provider, name)
    }

    remove(name: string) {
        this._list.splice(this._list.findIndex(e => e.name === name), 1)
        const p = this._map.get(name);
        if (p) {
            this._map.delete(name);
            this._name.delete(p);
        }
    }

    get<P extends PD.Params>(name: string): ThemeProvider<T, P> {
        return this._map.get(name) || this.emptyProvider
    }

    getName(provider: ThemeProvider<T, any>): string {
        if (!this._name.has(provider)) throw new Error(`'${provider.label}' is not a registered represenatation provider.`);
        return this._name.get(provider)!;
    }


    create(name: string, ctx: ThemeDataContext, props = {}) {
        const provider = this.get(name)
        return provider.factory(ctx, { ...PD.getDefaultValues(provider.getParams(ctx)), ...props })
    }

    getApplicableList(ctx: ThemeDataContext) {
        return this._list.filter(e => e.provider.isApplicable(ctx));
    }

    getApplicableTypes(ctx: ThemeDataContext) {
        return getTypes(this.getApplicableList(ctx))
    }
}