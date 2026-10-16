const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../assets/portada-horaria.js'), 'utf8');
let hour = 5;
let tick;
const styles = new Map();
const attributes = new Map();
const listeners = {};

class MockDate {
  getHours() { return hour; }
}
const document = {
  currentScript: {src: 'https://gentedevuelo.com/assets/portada-horaria.js'},
  documentElement: {
    style: {setProperty: (name, value) => styles.set(name, value)},
    setAttribute: (name, value) => attributes.set(name, value)
  },
  hidden: false,
  addEventListener: (event, callback) => { listeners[event] = callback; }
};
const window = {
  setInterval: (callback, delay) => { assert.equal(delay, 30000); tick = callback; },
  addEventListener: (event, callback) => { listeners[event] = callback; }
};

vm.runInNewContext(source, {document, window, URL, Date: MockDate});

function assertPeriod(atHour, expected) {
  hour = atHour;
  tick();
  assert.equal(attributes.get('data-portada-horaria'), expected);
  assert.match(styles.get('--gdv-portada-imagen'), new RegExp('portada-' + expected + '-tres-palas\\.webp'));
}

assertPeriod(5, 'noche');
assertPeriod(6, 'manana');
assertPeriod(11, 'manana');
assertPeriod(12, 'tarde');
assertPeriod(19, 'tarde');
assertPeriod(20, 'noche');
hour = 9;
listeners.focus();
assert.equal(attributes.get('data-portada-horaria'), 'manana');
hour = 21;
listeners.visibilitychange();
assert.equal(attributes.get('data-portada-horaria'), 'noche');

console.log('PASS: portada de tres palas cambia mañana/tarde/noche con la hora local');
