require("atoum.js")(module);

require('console');

module.include("../src/LSDManager.js");

module.exports = {
    testInstance: function() {
        var lsd;

        this
            .given(lsd = new LSDManager())
                .number(lsd.eventId)
                    .isEqualTo(0)
                .object(lsd.events)
                    .isEqualTo({})
                .object(lsd.entitiesMetadata)
                    .isEqualTo({})
                .object(lsd.storage)
                    .isInstanceOf(Storage)

            .given(storage = new Storage())
            .and(lsd = new LSDManager(storage))
                .object(lsd.storage)
                    .isIdenticalTo(storage)
        ;
    },
    testExtend: function() {
        var lsd;

        this
            .given(lsd = new LSDManager())
                .object(lsd.extend({}, {}))
                    .isEqualTo({})
                .object(lsd.extend({a: 1}, {}))
                    .isEqualTo({a: 1})
                .object(lsd.extend({}, {a: 1}))
                    .isEqualTo({a: 1})
                .object(lsd.extend({a: 2}, {a: 1}))
                    .isEqualTo({a: 1})
                .object(lsd.extend({a: 1}, {b: 1}))
                    .isEqualTo({a: 1, b: 1})
        ;
    },
    testFireEvent: function() {
        var lsd;

        this
            .given(lsd = new LSDManager())
            .and(lsd.registerEvent('event', eventCallback1 = this.generateCallback()))
            .and(lsd.registerEvent('event', eventCallback2 = this.generateCallback()))
            .and(lsd.registerEvent('event', eventCallback3 = this.generateCallback()))
            .and(repository = {})
            .and(data       = {})
            .and(consoleMock = this.generateStub(console, 'group',    function() {}))
            .and(consoleMock = this.generateStub(console, 'groupEnd', function() {}))
            .and(lsd.fireEvents('noevent', repository, data))
                .callback(eventCallback1)
                    .wasNotCalled()
                .callback(eventCallback2)
                    .wasNotCalled()
                .callback(eventCallback3)
                    .wasNotCalled()
            .and(lsd.fireEvents('event', repository, data))
                .callback(eventCallback1)
                    .wasCalled()
                    .withArguments(repository, data)
                .callback(eventCallback2)
                    .wasCalled()
                    .withArguments(repository, data)
                .callback(eventCallback3)
                    .wasCalled()
                    .withArguments(repository, data)

    },
    testFixValueType: function() {
        var lsd, o;

        this
            .given(lsd = new LSDManager())
                // without type => null
                .variable(lsd.fixValueType(1))
                    .isEqualTo(null)

                // convert true
                .bool(lsd.fixValueType(true, 'boolean'))
                    .isTruthy()
                .number(lsd.fixValueType(true, 'integer'))
                    .isEqualTo(1)
                .number(lsd.fixValueType(true, 'float'))
                    .isEqualTo(1)
                .string(lsd.fixValueType(true, 'string'))
                    .isEqualTo('true')
                .array(lsd.fixValueType(true, 'array'))
                    .isEqualTo([true])
                .object(lsd.fixValueType(true, 'object'))
                    .isEqualTo({ 0: true })

                // convert false
                .bool(lsd.fixValueType(false, 'boolean'))
                    .isFalsy()
                .number(lsd.fixValueType(false, 'integer'))
                    .isEqualTo(0)
                .number(lsd.fixValueType(false, 'float'))
                    .isEqualTo(0)
                .string(lsd.fixValueType(false, 'string'))
                    .isEqualTo('false')
                .array(lsd.fixValueType(false, 'array'))
                    .isEqualTo([false])
                .object(lsd.fixValueType(false, 'object'))
                    .isEqualTo({ 0: false })

                // convert integer
                .bool(lsd.fixValueType(0, 'boolean'))
                    .isFalsy()
                .bool(lsd.fixValueType(1, 'boolean'))
                    .isTruthy()
                .number(lsd.fixValueType(1, 'integer'))
                    .isEqualTo(1)
                .number(lsd.fixValueType(1, 'float'))
                    .isEqualTo(1)
                .string(lsd.fixValueType(1, 'string'))
                    .isEqualTo('1')
                .array(lsd.fixValueType(1, 'array'))
                    .isEqualTo([1])
                .object(lsd.fixValueType(1, 'object'))
                    .isEqualTo({ 0: 1 })

                // convert float
                .bool(lsd.fixValueType(0.337, 'boolean'))
                    .isTruthy()
                .bool(lsd.fixValueType(1.337, 'boolean'))
                    .isTruthy()
                .number(lsd.fixValueType(1.337, 'integer'))
                    .isEqualTo(1)
                .number(lsd.fixValueType(1.5, 'integer'))
                    .isEqualTo(2)
                .number(lsd.fixValueType(1.337, 'float'))
                    .isEqualTo(1.337)
                .string(lsd.fixValueType(1.337, 'string'))
                    .isEqualTo('1.337')
                .array(lsd.fixValueType(1.337, 'array'))
                    .isEqualTo([1.337])
                .object(lsd.fixValueType(1.337, 'object'))
                    .isEqualTo({ 0: 1.337 })

                // convert string
                .bool(lsd.fixValueType('true', 'boolean'))
                    .isTruthy()
                .bool(lsd.fixValueType('false', 'boolean'))
                    .isFalsy()
                .bool(lsd.fixValueType('geek', 'boolean'))
                    .isTruthy()
                .number(lsd.fixValueType('1.337', 'integer'))
                    .isEqualTo(1)
                .number(lsd.fixValueType('geek', 'integer'))
                    .isEqualTo(0)
                .number(lsd.fixValueType('1.337', 'float'))
                    .isEqualTo(1.337)
                .string(lsd.fixValueType(o = '1.337', 'string'))
                    .isIdenticalTo(o)
                .array(lsd.fixValueType('1.337', 'array'))
                    .isEqualTo(['1.337'])
                .object(lsd.fixValueType('1.337', 'object'))
                    .isEqualTo({ 0: '1.337' })

                // convert array
                .bool(lsd.fixValueType([], 'boolean'))
                    .isFalsy()
                .bool(lsd.fixValueType([1], 'boolean'))
                    .isTruthy()
                .number(lsd.fixValueType([0], 'integer'))
                    .isEqualTo(1)
                .number(lsd.fixValueType([0, 1, 2], 'integer'))
                    .isEqualTo(3)
                .number(lsd.fixValueType([0], 'float'))
                    .isEqualTo(1)
                .number(lsd.fixValueType([0, 1, 2], 'float'))
                    .isEqualTo(3)
                .string(lsd.fixValueType([0], 'string'))
                    .isEqualTo('[0]')
                .string(lsd.fixValueType([0, 1, 2], 'string'))
                    .isEqualTo('[0,1,2]')
                .array(lsd.fixValueType(o = [0, 1, 2], 'array'))
                    .isIdenticalTo(o)
                .object(lsd.fixValueType([1, 2, 3], 'object'))
                    .isEqualTo({ 0: 1, 1: 2, 2: 3 })

                // convert object
                .bool(lsd.fixValueType({}, 'boolean'))
                    .isFalsy()
                .bool(lsd.fixValueType({ a: 1 }, 'boolean'))
                    .isTruthy()
                .number(lsd.fixValueType({}, 'integer'))
                    .isEqualTo(0)
                .number(lsd.fixValueType({}, 'float'))
                    .isEqualTo(0)
                .string(lsd.fixValueType({ a: 1 }, 'string'))
                    .isEqualTo('{"a":1}')
                .array(lsd.fixValueType({ a: 1 }, 'array'))
                    .isEqualTo([1])
                .object(lsd.fixValueType(o = { a: 1 }, 'object'))
                    .isIdenticalTo(o)
        ;
    },
    testGetType: function() {
        var lsd;

        this
            .given(lsd = new LSDManager())
                .string(lsd.getType(undefined))
                    .isEqualTo('undefined')
                .string(lsd.getType(null))
                    .isEqualTo('null')
                .string(lsd.getType(true))
                    .isEqualTo('boolean')
                .string(lsd.getType(false))
                    .isEqualTo('boolean')
                .string(lsd.getType(1))
                    .isEqualTo('number')
                .string(lsd.getType(1.337))
                    .isEqualTo('number')
                .string(lsd.getType('geek'))
                    .isEqualTo('string')
                .string(lsd.getType([]))
                    .isEqualTo('array')
                .string(lsd.getType({}))
                    .isEqualTo('object')
                .string(lsd.getType(function() {}))
                    .isEqualTo('function')
        ;
    },
    testUnRegisterEvent: function() {
        var lsd;

        this
            .given(lsd = new LSDManager())
                .object(lsd.events)
                    .hasLength(0)

                .given(eventCallback1 = function() {})
                    .number(lsd.registerEvent('event1', eventCallback1))
                        .isEqualTo(0)
                    .object(lsd.events)
                        .hasLength(1)
                        .hasMember('event1')
                    .object(lsd.events.event1)
                        .hasLength(2)
                        .hasMember('length')
                        .hasMember(0)
                    .number(lsd.events.event1.length)
                        .isEqualTo(1)
                    .function(lsd.events.event1[0])
                        .isIdenticalTo(eventCallback1)

                .given(eventCallback2 = function() {})
                    .number(lsd.registerEvent('event1', eventCallback2))
                        .isEqualTo(1)
                    .object(lsd.events)
                        .hasLength(1)
                        .hasMember('event1')
                    .object(lsd.events.event1)
                        .hasLength(3)
                        .hasMember('length')
                        .hasMember(0)
                        .hasMember(1)
                    .number(lsd.events.event1.length)
                        .isEqualTo(2)
                    .function(lsd.events.event1[1])
                        .isIdenticalTo(eventCallback2)

                .given(eventCallback3 = function() {})
                    .number(lsd.registerEvent('event2', eventCallback3))
                        .isEqualTo(2)
                    .object(lsd.events)
                        .hasLength(2)
                        .hasMember('event1')
                        .hasMember('event2')
                    .object(lsd.events.event2)
                        .hasLength(2)
                        .hasMember('length')
                        .hasMember(2)
                    .number(lsd.events.event2.length)
                        .isEqualTo(1)
                    .function(lsd.events.event2[2])
                        .isIdenticalTo(eventCallback3)

                // unregister an unknown event => do nothing
                .given(lsd.unregisterEvent('event3'))
                    .object(lsd.events)
                        .hasLength(2)
                        .hasMember('event1')
                        .hasMember('event2')
                    .object(lsd.events.event1)
                        .hasLength(3)
                        .hasMember('length')
                        .hasMember(0)
                        .hasMember(1)
                    .object(lsd.events.event2)
                        .hasLength(2)
                        .hasMember('length')
                        .hasMember(2)

                // unregister an unknown eventId => do nothing
                .given(lsd.unregisterEvent('event1', 10))
                    .object(lsd.events)
                        .hasLength(2)
                        .hasMember('event1')
                        .hasMember('event2')
                    .object(lsd.events.event1)
                        .hasLength(3)
                        .hasMember('length')
                        .hasMember(0)
                        .hasMember(1)
                    .object(lsd.events.event2)
                        .hasLength(2)
                        .hasMember('length')
                        .hasMember(2)

                // unregister an eventId of an other event => do nothing
                .given(lsd.unregisterEvent('event1', 2))
                    .object(lsd.events)
                        .hasLength(2)
                        .hasMember('event1')
                        .hasMember('event2')
                    .object(lsd.events.event1)
                        .hasLength(3)
                        .hasMember('length')
                        .hasMember(0)
                        .hasMember(1)
                    .object(lsd.events.event2)
                        .hasLength(2)
                        .hasMember('length')
                        .hasMember(2)

                // unregister a known eventId
                .given(lsd.unregisterEvent('event1', 0))
                    .object(lsd.events)
                        .hasLength(2)
                        .hasMember('event1')
                        .hasMember('event2')
                    .object(lsd.events.event1)
                        .hasLength(2)
                        .hasMember('length')
                        .hasMember(1)
                    .object(lsd.events.event2)
                        .hasLength(2)
                        .hasMember('length')
                        .hasMember(2)

                // unregister the last callback of an event
                .given(lsd.unregisterEvent('event1', 1))
                    .object(lsd.events)
                        .hasLength(1)
                        .hasMember('event2')
                    .object(lsd.events.event2)
                        .hasLength(2)
                        .hasMember('length')
                        .hasMember(2)
        ;
    }
};