import {ISchema, toJoi, toSwagger} from './ischema';
import * as joi from 'joi';
import {registerMethod, registerMiddleware} from './utils';

export const TAG_RESPONSE = Symbol('Response');

const RESPONSES: Map<Function, Map<string, Map<number, ISchema | joi.Schema>>> = new Map();

export const DEFAULT_RESPONSE: joi.Schema = joi.string().default('');

export function response(code: number, schema?: ISchema | joi.Schema): MethodDecorator {
    return function (target: any, key: string) {
        if (!schema) {
            schema = DEFAULT_RESPONSE;
        }
        if (!RESPONSES.has(target.constructor)) {
            RESPONSES.set(target.constructor, new Map());
        }
        if (!RESPONSES.get(target.constructor).has(key)) {
            RESPONSES.get(target.constructor).set(key, new Map());
        }
        registerMethod(target, key, function fnResponse(router) {
            if (!router.responses) {
                router.responses = {};
            }
            schema = toSwagger(schema);
            let description = '';
            if (schema['description']) {
                description = schema['description'];
                delete schema['description'];
            }
            router.responses[code] = Object.assign({description: description}, {schema});
        });

        registerMiddleware(target, key, async function fnResponse(ctx, next) {
            await next();
            if (RESPONSES.get(target.constructor).get(key).has(ctx.status)) {
                let {error, value} = joi.validate(ctx.body, RESPONSES.get(target.constructor).get(key).get(ctx.status));
                if (error) {
                    ctx.body = {code: 500, message: error.message};
                    ctx.status = 500;
                    return;
                }
                ctx.body = value;
            }
        });

        RESPONSES.get(target.constructor).get(key).set(code, toJoi(schema));
        target[TAG_RESPONSE] = target.constructor[TAG_RESPONSE] = RESPONSES.get(target.constructor);
    }
}
