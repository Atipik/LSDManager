require("atoum.js")(module);

if (typeof localStorage === "undefined" || localStorage === null) {
    var LocalStorage = require('node-localstorage').LocalStorage;
    localStorage = new LocalStorage('/tmp/localStorage');
}

module.include("../src/LSDManager.js");

var storage;

module.exports = {
    setUp: function() {
        localStorage.clear();
    },

    testInstance: function() {
        this
            .given(storage = new Storage())
                .string(storage.$prefix)
                    .isEqualTo('storage')
                .string(storage.$separator)
                    .isEqualTo('.')

            .given(storage = new Storage('foobar'))
                .string(storage.$prefix)
                    .isEqualTo('foobar')
                .string(storage.$separator)
                    .isEqualTo('.')
        ;
    },

    testKey: function() {
        this
            .given(storage = new Storage('prefix'))
                .string(storage.key(['foo', 'bar']))
                    .isEqualTo('foo.bar')
        ;
    },

    testSetGetHasUnset: function() {
        this
            .given(storage = new Storage('prefix'))
                .object(storage.set('foo', value = true))
                    .isIdenticalTo(storage)
                .bool(storage.get('foo'))
                    .isEqualTo(value)

                .object(storage.set('foo', value = 1337))
                    .isIdenticalTo(storage)
                .number(storage.get('foo'))
                    .isEqualTo(value)

                .object(storage.set('foo', value = 13.37))
                    .isIdenticalTo(storage)
                .number(storage.get('foo'))
                    .isEqualTo(value)

                .object(storage.set('foo', value = 'bar'))
                    .isIdenticalTo(storage)
                .string(storage.get('foo'))
                    .isEqualTo(value)

                .object(storage.set('foo', value = []))
                    .isIdenticalTo(storage)
                .array(storage.get('foo'))
                    .isEqualTo(value)

                .object(storage.set('foo', value = [1, 2, 3, 4]))
                    .isIdenticalTo(storage)
                .array(storage.get('foo'))
                    .isEqualTo(value)

                .object(storage.set('foo', value = {}))
                    .isIdenticalTo(storage)
                .object(storage.get('foo'))
                    .isEqualTo(value)

                .object(storage.set('foo', value = { foo: 1, bar: 2 }))
                    .isIdenticalTo(storage)
                .object(storage.get('foo'))
                    .isEqualTo(value)

                .variable(storage.get('bar'))
                    .isEqualTo(null)

                .variable(storage.get('bar', 'foobar'))
                    .isEqualTo('foobar')

                .bool(storage.has('foo'))
                    .isTrue()

                .bool(storage.has('bar'))
                    .isFalse()

                .object(storage.unset('foo'))
                    .isIdenticalTo(storage)
                .bool(storage.has('foo'))
                    .isFalse()
        ;
    }
};