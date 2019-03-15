/**
 * Copyright (c) 2019 mol* contributors, licensed under MIT, See LICENSE file for more info.
 *
 * @author Alexander Rose <alexander.rose@weirdbyte.de>
 */

import { Color, ColorScale } from 'mol-util/color';
import { StructureElement, Unit, Link, ElementIndex } from 'mol-model/structure';
import { Location } from 'mol-model/location';
import { ColorTheme } from '../color';
import { ParamDefinition as PD } from 'mol-util/param-definition'
import { ThemeDataContext } from '../theme';
import { ColorListName, ColorListOptions } from 'mol-util/color/scale';

const DefaultUncertaintyColor = Color(0xffff99)
const Description = `Assigns a color based on the uncertainty of an element's position, , e.g. B-factor or RMSF, depending on the data availability and experimental technique.`

export const UncertaintyColorThemeParams = {
    domain: PD.Interval([0, 100]),
    list: PD.ColorScale<ColorListName>('RedWhiteBlue', ColorListOptions),
}
export type UncertaintyColorThemeParams = typeof UncertaintyColorThemeParams
export function getUncertaintyColorThemeParams(ctx: ThemeDataContext) {
    return UncertaintyColorThemeParams // TODO return copy
}

export function getUncertainty(unit: Unit, element: ElementIndex): number {
    if (Unit.isAtomic(unit)) {
        return unit.model.atomicConformation.B_iso_or_equiv.value(element)
    } else if (Unit.isSpheres(unit)) {
        return unit.model.coarseConformation.spheres.rmsf[element]
    } else {
        return 0
    }
}

export function UncertaintyColorTheme(ctx: ThemeDataContext, props: PD.Values<UncertaintyColorThemeParams>): ColorTheme<UncertaintyColorThemeParams> {
    const scale = ColorScale.create({
        reverse: true,
        domain: props.domain,
        listOrName: props.list,
    })

    // TODO calc domain based on data, set min/max as 10/90 percentile to be robust against outliers

    function color(location: Location): Color {
        if (StructureElement.isLocation(location)) {
            return scale.color(getUncertainty(location.unit, location.element))
        } else if (Link.isLocation(location)) {
            return scale.color(getUncertainty(location.aUnit, location.aUnit.elements[location.aIndex]))
        }
        return DefaultUncertaintyColor
    }

    return {
        factory: UncertaintyColorTheme,
        granularity: 'group',
        color,
        props,
        description: Description,
        legend: scale ? scale.legend : undefined
    }
}

export const UncertaintyColorThemeProvider: ColorTheme.Provider<UncertaintyColorThemeParams> = {
    label: 'Uncertainty',
    factory: UncertaintyColorTheme,
    getParams: getUncertaintyColorThemeParams,
    defaultValues: PD.getDefaultValues(UncertaintyColorThemeParams),
    isApplicable: (ctx: ThemeDataContext) => !!ctx.structure
}