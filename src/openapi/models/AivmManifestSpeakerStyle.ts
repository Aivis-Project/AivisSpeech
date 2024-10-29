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
import type { AivmManifestVoiceSample } from './AivmManifestVoiceSample';
import {
    AivmManifestVoiceSampleFromJSON,
    AivmManifestVoiceSampleFromJSONTyped,
    AivmManifestVoiceSampleToJSON,
} from './AivmManifestVoiceSample';

/**
 * AIVM マニフェストの話者スタイル情報 
 * @export
 * @interface AivmManifestSpeakerStyle
 */
export interface AivmManifestSpeakerStyle {
    /**
     * 
     * @type {string}
     * @memberof AivmManifestSpeakerStyle
     */
    name: string;
    /**
     * 
     * @type {string}
     * @memberof AivmManifestSpeakerStyle
     */
    icon?: string | null;
    /**
     * 
     * @type {number}
     * @memberof AivmManifestSpeakerStyle
     */
    localId: number;
    /**
     * 
     * @type {Array<AivmManifestVoiceSample>}
     * @memberof AivmManifestSpeakerStyle
     */
    voiceSamples?: Array<AivmManifestVoiceSample>;
}

/**
 * Check if a given object implements the AivmManifestSpeakerStyle interface.
 */
export function instanceOfAivmManifestSpeakerStyle(value: object): boolean {
    let isInstance = true;
    isInstance = isInstance && "name" in value;
    isInstance = isInstance && "localId" in value;

    return isInstance;
}

export function AivmManifestSpeakerStyleFromJSON(json: any): AivmManifestSpeakerStyle {
    return AivmManifestSpeakerStyleFromJSONTyped(json, false);
}

export function AivmManifestSpeakerStyleFromJSONTyped(json: any, ignoreDiscriminator: boolean): AivmManifestSpeakerStyle {
    if ((json === undefined) || (json === null)) {
        return json;
    }
    return {
        
        'name': json['name'],
        'icon': !exists(json, 'icon') ? undefined : json['icon'],
        'localId': json['local_id'],
        'voiceSamples': !exists(json, 'voice_samples') ? undefined : ((json['voice_samples'] as Array<any>).map(AivmManifestVoiceSampleFromJSON)),
    };
}

export function AivmManifestSpeakerStyleToJSON(value?: AivmManifestSpeakerStyle | null): any {
    if (value === undefined) {
        return undefined;
    }
    if (value === null) {
        return null;
    }
    return {
        
        'name': value.name,
        'icon': value.icon,
        'local_id': value.localId,
        'voice_samples': value.voiceSamples === undefined ? undefined : ((value.voiceSamples as Array<any>).map(AivmManifestVoiceSampleToJSON)),
    };
}

