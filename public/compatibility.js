(function installRuntimeCompatibility(root) {
  if (!root) return;

  if (typeof root.globalThis === 'undefined') {
    Object.defineProperty(root, 'globalThis', {
      configurable: true,
      value: root,
      writable: true
    });
  }

  if (typeof Object.fromEntries !== 'function') {
    Object.fromEntries = function fromEntries(iterable) {
      var result = {};
      var entries = Array.from(iterable);
      for (var index = 0; index < entries.length; index += 1) {
        var entry = entries[index];
        result[entry[0]] = entry[1];
      }
      return result;
    };
  }

  if (typeof Promise.allSettled !== 'function') {
    Promise.allSettled = function allSettled(iterable) {
      return Promise.all(Array.from(iterable).map(function settle(item) {
        return Promise.resolve(item).then(
          function fulfilled(value) { return { status: 'fulfilled', value: value }; },
          function rejected(reason) { return { status: 'rejected', reason: reason }; }
        );
      }));
    };
  }

  if (typeof Promise.prototype.finally !== 'function') {
    Promise.prototype.finally = function promiseFinally(callback) {
      var PromiseType = this.constructor || Promise;
      return this.then(
        function fulfilled(value) {
          return PromiseType.resolve(callback()).then(function returnValue() { return value; });
        },
        function rejected(reason) {
          return PromiseType.resolve(callback()).then(function throwReason() { throw reason; });
        }
      );
    };
  }

  if (typeof Array.prototype.flatMap !== 'function') {
    Array.prototype.flatMap = function flatMap(callback, thisArg) {
      var result = [];
      for (var index = 0; index < this.length; index += 1) {
        if (!(index in this)) continue;
        var mapped = callback.call(thisArg, this[index], index, this);
        if (Array.isArray(mapped)) result.push.apply(result, mapped);
        else result.push(mapped);
      }
      return result;
    };
  }

  if (typeof String.prototype.matchAll !== 'function') {
    String.prototype.matchAll = function matchAll(regexp) {
      var source = regexp instanceof RegExp ? regexp.source : String(regexp);
      var flags = regexp instanceof RegExp ? regexp.flags : 'g';
      if (flags.indexOf('g') === -1) throw new TypeError('matchAll requires a global RegExp');
      var matcher = new RegExp(source, flags);
      var input = String(this);
      var iterator = {
        next: function next() {
          var match = matcher.exec(input);
          if (!match) return { done: true, value: undefined };
          if (match[0] === '') matcher.lastIndex += 1;
          return { done: false, value: match };
        }
      };
      if (typeof Symbol !== 'undefined' && Symbol.iterator) {
        iterator[Symbol.iterator] = function iteratorMethod() { return this; };
      }
      return iterator;
    };
  }

  if (typeof root.structuredClone !== 'function') {
    root.structuredClone = function structuredCloneFallback(value) {
      if (typeof value === 'undefined') return undefined;
      return JSON.parse(JSON.stringify(value));
    };
  }

  if (typeof root.AbortController !== 'function') {
    function CompatAbortSignal() {
      this.aborted = false;
      this.reason = undefined;
      this.onabort = null;
      this.listeners = [];
    }
    CompatAbortSignal.prototype.addEventListener = function addEventListener(type, listener) {
      if (type === 'abort' && typeof listener === 'function') this.listeners.push(listener);
    };
    CompatAbortSignal.prototype.removeEventListener = function removeEventListener(type, listener) {
      if (type !== 'abort') return;
      this.listeners = this.listeners.filter(function keep(item) { return item !== listener; });
    };

    function CompatAbortController() {
      this.signal = new CompatAbortSignal();
    }
    CompatAbortController.prototype.abort = function abort(reason) {
      if (this.signal.aborted) return;
      this.signal.aborted = true;
      this.signal.reason = reason || new Error('The operation was aborted');
      var event = { type: 'abort', target: this.signal };
      if (typeof this.signal.onabort === 'function') this.signal.onabort(event);
      this.signal.listeners.slice().forEach(function notify(listener) { listener(event); });
    };

    root.AbortController = CompatAbortController;
  }

  if (typeof root.queueMicrotask !== 'function') {
    root.queueMicrotask = function queueMicrotaskFallback(callback) {
      Promise.resolve().then(callback).catch(function report(error) {
        setTimeout(function throwAsync() { throw error; }, 0);
      });
    };
  }
})(typeof self !== 'undefined' ? self : (typeof window !== 'undefined' ? window : undefined));
