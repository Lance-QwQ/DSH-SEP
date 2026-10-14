import test from 'node:test';
import assert from 'node:assert/strict';
import {createTrustedParser} from './trusted-parser.mjs';
test('parser rejects unrecognized configuration before dispatch',async()=>{await assert.rejects(createTrustedParser({shell:true}),{code:'SEP_MAC_PARSER_CONFIG'});});
test('parser does not accept arbitrary executable modes as parser kinds',async()=>{await assert.rejects(createTrustedParser({kind:'shell'}),{code:'SEP_MAC_PARSER_CONFIG'});});
test('parser rejects absent ownership IO before attempting a platform launch',async()=>{await assert.rejects(createTrustedParser({kind:'context-python'}),{code:'SEP_MAC_PARSER_CONFIG'});});
