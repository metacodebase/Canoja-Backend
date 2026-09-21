const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const location = require('../src/utils/licenseLocation');

function loadController(records = []) {
  const queries = [];
  const matches = (record, query) => Object.entries(query).every(([key, value]) => {
    if (key === '$and') return value.every(part => matches(record, part));
    if (key === '$or') return value.some(part => matches(record, part));
    if (value instanceof RegExp || value?.test) return value.test(record[key] || '');
    if (value && typeof value === 'object') {
      if (value.$regex && !value.$regex.test(record[key] || '')) return false;
      if ('$ne' in value && record[key] === value.$ne) return false;
      return true;
    }
    return record[key] === value;
  });
  const model = {
    countDocuments: async query => records.filter(record => matches(record, query)).length,
    find(query) {
      queries.push(query);
      let rows = records.filter(record => matches(record, query));
      return {
        sort() { return this; },
        skip(n) { rows = rows.slice(n); return this; },
        limit(n) { rows = rows.slice(0, n); return this; },
        async lean() { return rows; },
      };
    },
  };
  const context = vm.createContext({
    module: {exports: {}}, console: {log() {}, error() {}},
    require(id) {
      if (id === '../models/licenseRecord') return model;
      if (id === '../utils/licenseLocation') return location;
      if (id === 'axios') return {get: async () => ({data: []})};
      throw new Error(`Unexpected dependency: ${id}`);
    },
  });
  const source = fs.readFileSync(path.join(__dirname, '../src/controllers/shopController.js'), 'utf8');
  vm.runInContext(source + '\nmodule.exports.testHours = isWithinHoursRange; module.exports.testKeyword = buildKeywordQuery;', context);
  return {...context.module.exports, queries};
}

async function search(controller, body) {
  let status = 200, response;
  await controller.compareShops({body}, {
    status(value) { status = value; return this; },
    json(value) { response = value; },
  });
  assert.equal(status, 200);
  return response.data;
}

const records = [
  {_id: 'unverified', business_name: 'Shop A', country_code: 'US', canojaVerified: false},
  {_id: 'expired', business_name: 'Shop B', country_code: 'US', canojaVerified: true, expiration_date: '2000-01-01'},
  {_id: 'valid', business_name: 'Shop C', country_code: 'US', canojaVerified: true, expiration_date: '2999-01-01'},
];

for (const field of ['cannojaVerified', 'canojaVerified']) {
  for (const query of [{country: 'US'}, {keyword: 'Shop'}]) {
    test(`${field} filters before pagination for ${JSON.stringify(query)}`, async () => {
      const controller = loadController(records);
      const data = await search(controller, {...query, filters: {[field]: true}, page: 1, limit: 1});
      assert.equal(data.shops.length, 1);
      assert.equal(data.shops[0]._id, 'valid');
      assert.equal(data.pagination.total_results, 1);
      assert.equal(data.pagination.has_more, false);
      assert(controller.queries.some(q => q.canojaVerified === true || q.$and?.some(c => c.canojaVerified === true)));
    });
  }
}

test('keyword punctuation is literal and does not crash', async () => {
  const controller = loadController([{_id: 'literal', business_name: 'Shop [.*'}, {_id: 'other', business_name: 'Shop Other'}]);
  for (const keyword of ['[', '.*', '[.*']) {
    const data = await search(controller, {keyword});
    assert.deepEqual(Array.from(data.shops, shop => shop._id), ['literal']);
  }
});

test('opening hours preserve minutes, noon, midnight and overnight boundaries', () => {
  const {testHours} = loadController();
  for (const [hours, minutes, expected] of [
    ['9:30 AM-5:30 PM', 555, false], ['9:30 AM-5:30 PM', 570, true],
    ['9:30 AM-5:30 PM', 1035, true], ['9:30 AM-5:30 PM', 1050, false],
    ['09:30–17:30', 1035, true], ['12:15 PM—1:45 PM', 735, true],
    ['10:30 PM-2:15 AM', 90, true], ['10:30 PM-2:15 AM', 135, false],
    ['12:15 AM-1:30 AM', 10, false], ['12:15 AM-1:30 AM', 15, true],
  ]) assert.equal(testHours(hours, minutes), expected, `${hours} at ${minutes}`);
});

test('open-now uses current hours before pagination instead of stored status', async () => {
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const controller = loadController([
    {_id: 'closed', business_name: 'Shop A', country_code: 'US', open_now: true, working_hours: Object.fromEntries(days.map(day => [day, 'Closed']))},
    {_id: 'open', business_name: 'Shop B', country_code: 'US', open_now: false, working_hours: Object.fromEntries(days.map(day => [day, 'Open 24 hours']))},
  ]);
  for (const query of [{country: 'US'}, {keyword: 'Shop'}]) {
    const data = await search(controller, {...query, filters: {openNow: true}, limit: 1});
    assert.equal(data.shops[0]._id, 'open');
    assert.equal(data.pagination.total_results, 1);
    assert.equal(data.pagination.has_more, false);
  }
});
