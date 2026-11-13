'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { parse } = require('@babel/parser');

test('the complete browser entrypoint JSX parses before deployment', () => {
    const htmlPath = path.join(__dirname, '..', 'index.html');
    const html = fs.readFileSync(htmlPath, 'utf8');
    const scripts = [...html.matchAll(/<script\s+type=["']text\/babel["'][^>]*>([\s\S]*?)<\/script>/gi)];

    assert.equal(scripts.length, 1, 'index.html must contain exactly one Babel JSX entrypoint');

    assert.doesNotThrow(() => {
        parse(scripts[0][1], {
            sourceType: 'script',
            sourceFilename: 'index.html#babel-entrypoint',
            plugins: ['jsx']
        });
    }, 'the complete JSX entrypoint must be syntactically valid');
});

test('the browser entrypoint keeps its runtime dependencies in executable order', () => {
    const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
    const reactIndex = html.indexOf('react@18.3.1/umd/react.production.min.js');
    const domIndex = html.indexOf('react-dom@18.3.1/umd/react-dom.production.min.js');
    const babelIndex = html.indexOf('@babel/standalone@');
    const entryIndex = html.indexOf('<script type="text/babel">');
    const lifecycleIndex = html.indexOf('online-room-lifecycle.js');
    const rulesIndex = html.indexOf('game-rules.js');

    for (const [name, index] of Object.entries({
        React: reactIndex,
        ReactDOM: domIndex,
        Babel: babelIndex,
        'online lifecycle': lifecycleIndex,
        'game rules': rulesIndex,
        'JSX entrypoint': entryIndex
    })) {
        assert.notEqual(index, -1, name + ' script must be present');
    }

    assert.ok(reactIndex < domIndex, 'React must load before ReactDOM');
    assert.ok(domIndex < babelIndex, 'ReactDOM must load before Babel');
    assert.ok(babelIndex < entryIndex, 'Babel must load before the JSX entrypoint');
    assert.ok(lifecycleIndex < entryIndex, 'room lifecycle helpers must load before the app');
    assert.ok(rulesIndex < entryIndex, 'game rules must load before the app');
});
