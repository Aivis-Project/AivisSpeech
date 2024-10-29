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


/**
 * 
 * @export
 */
export const ModelFormat = {
    Safetensors: 'Safetensors',
    Onnx: 'ONNX'
} as const;
export type ModelFormat = typeof ModelFormat[keyof typeof ModelFormat];


export function ModelFormatFromJSON(json: any): ModelFormat {
    return ModelFormatFromJSONTyped(json, false);
}

export function ModelFormatFromJSONTyped(json: any, ignoreDiscriminator: boolean): ModelFormat {
    return json as ModelFormat;
}

export function ModelFormatToJSON(value?: ModelFormat | null): any {
    return value as any;
}

