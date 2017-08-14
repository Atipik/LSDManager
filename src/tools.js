    function isPromise(object) {
        return object && object.then !== undefined;
    }

    function toPromise(object) {
        if (!isPromise(object)) {
            return Promise.resolve(object);
        }

        return object;
    }

    function promiseForEach(collection, fn, chain) {
        var keys = Object.keys(collection);
        chain    = chain && isPromise(chain) ? chain.then(function() { return 0; }) : Promise.resolve(0);

        return chain.then(
            function loop(i) {
                if (i < keys.length) {
                    return fn(collection[keys[i]], keys[i])
                        .then(
                            function() {
                                return i + 1;
                            }
                        )
                        .then(loop)
                    ;
                }
            }
        );
    }
