'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync(require.resolve('../workspace-app.js'), 'utf8');
const renderSource = source.slice(source.indexOf('  function render() {'), source.indexOf('  function readRoute() {'));

function firstWorkspaceRoute(canCreate, loading = false) {
  const state = { view: 'new-workspace', capabilities: { canCreate }, active: null, data: null, editor: null, loading };
  const content = { innerHTML: '' };
  vm.runInNewContext(renderSource + '\nrender();', {
    state, document: { getElementById: () => content }, navigation() {},
    editorView: () => 'workspace-editor', heading: () => '',
    empty: () => 'no-access', button: () => '',
  });
  return { state, content };
}

test('a bootstrap operator can open the first-workspace route without membership', () => {
  const { state, content } = firstWorkspaceRoute(true);
  assert.equal(state.editor.type, 'workspace');
  assert.equal(content.innerHTML, 'workspace-editor');
});

test('an unassigned account without creation permission keeps the access explanation', () => {
  const { state, content } = firstWorkspaceRoute(false);
  assert.equal(state.editor, null);
  assert.equal(content.innerHTML, 'no-access');
});

test('workspace creation waits for capabilities to finish loading', () => {
  const { state, content } = firstWorkspaceRoute(true, true);
  assert.equal(state.editor, null);
  assert.match(content.innerHTML, /Opening your workspace/);
});
