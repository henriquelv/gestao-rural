import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import { describe, expect, it } from 'vitest';

describe('compatibilidade com Android System WebView antigo', () => {
  it('instala os recursos usados pelo bundle quando o WebView nao os oferece', async () => {
    const source = readFileSync('public/compatibility.js', 'utf8');
    const context = createContext({ console, setTimeout, clearTimeout });

    runInContext(
      'self=this; Object.fromEntries=undefined; Promise.allSettled=undefined; Promise.prototype.finally=undefined; Array.prototype.flatMap=undefined; String.prototype.matchAll=undefined; structuredClone=undefined; AbortController=undefined; queueMicrotask=undefined;',
      context
    );
    runInContext(source, context);

    const result = await runInContext(`(async function () {
      var controller = new AbortController();
      controller.abort();
      return {
        entry: Object.fromEntries([['farm', 'starmilk']]).farm,
        settled: (await Promise.allSettled([Promise.reject('offline')]))[0].status,
        flat: [1, 2].flatMap(function (value) { return [value, value]; }).join(','),
        matches: Array.from('jan-fev'.matchAll(/[a-z]+/g)).length,
        clone: structuredClone({ count: 4 }).count,
        aborted: controller.signal.aborted
      };
    })()`, context);

    expect(result).toEqual({
      entry: 'starmilk',
      settled: 'rejected',
      flat: '1,1,2,2',
      matches: 2,
      clone: 4,
      aborted: true
    });
  });
});
