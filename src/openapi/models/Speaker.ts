/* tslint:disable */
/* eslint-disable */
/**
 * AivisSpeech Engine
 * AivisSpeech の音声合成エンジンです。
 *
 * The version of the OpenAPI document: latest
 * 
 *
 * NOTE: This class is auto generated by OpenAPI Generator (https://openapi-generator.tech).
 * https://openapi-generator.tech
 * Do not edit the class manually.
 */

import { exists, mapValues } from '../runtime';
import type { SpeakerStyle } from './SpeakerStyle';
import {
    SpeakerStyleFromJSON,
    SpeakerStyleFromJSONTyped,
    SpeakerStyleToJSON,
} from './SpeakerStyle';
import type { SpeakerSupportedFeatures } from './SpeakerSupportedFeatures';
import {
    SpeakerSupportedFeaturesFromJSON,
    SpeakerSupportedFeaturesFromJSONTyped,
    SpeakerSupportedFeaturesToJSON,
} from './SpeakerSupportedFeatures';

/**
 * キャラクター情報
 * @export
 * @interface Speaker
 */
export interface Speaker {
    /**
     * 名前
     * @type {string}
     * @memberof Speaker
     */
    name: string;
    /**
     * キャラクターの UUID
     * @type {string}
     * @memberof Speaker
     */
    speakerUuid: string;
    /**
     * スタイルの一覧
     * @type {Array<SpeakerStyle>}
     * @memberof Speaker
     */
    styles: Array<SpeakerStyle>;
    /**
     * キャラクターのバージョン
     * @type {string}
     * @memberof Speaker
     */
    version: string;
    /**
     * 
     * @type {SpeakerSupportedFeatures}
     * @memberof Speaker
     */
    supportedFeatures?: SpeakerSupportedFeatures;
}

/**
 * Check if a given object implements the Speaker interface.
 */
export function instanceOfSpeaker(value: object): boolean {
    let isInstance = true;
    isInstance = isInstance && "name" in value;
    isInstance = isInstance && "speakerUuid" in value;
    isInstance = isInstance && "styles" in value;
    isInstance = isInstance && "version" in value;

    return isInstance;
}

export function SpeakerFromJSON(json: any): Speaker {
    return SpeakerFromJSONTyped(json, false);
}

export function SpeakerFromJSONTyped(json: any, ignoreDiscriminator: boolean): Speaker {
    if ((json === undefined) || (json === null)) {
        return json;
    }
    return {
        
        'name': json['name'],
        'speakerUuid': json['speaker_uuid'],
        'styles': ((json['styles'] as Array<any>).map(SpeakerStyleFromJSON)),
        'version': json['version'],
        'supportedFeatures': !exists(json, 'supported_features') ? undefined : SpeakerSupportedFeaturesFromJSON(json['supported_features']),
    };
}

export function SpeakerToJSON(value?: Speaker | null): any {
    if (value === undefined) {
        return undefined;
    }
    if (value === null) {
        return null;
    }
    return {
        
        'name': value.name,
        'speaker_uuid': value.speakerUuid,
        'styles': ((value.styles as Array<any>).map(SpeakerStyleToJSON)),
        'version': value.version,
        'supported_features': SpeakerSupportedFeaturesToJSON(value.supportedFeatures),
    };
}

