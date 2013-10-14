describe("DataManager class", function() {
    it("DataManager constructor", function() {
        var dm = new DataManager();

        expect(dm.eventId).toBe(0);
        expect(dm.events).toEqual({});
        expect(dm.entitiesMetadata).toEqual({});
        expect(dm.storage instanceof Storage).toBeTruthy();
    });

    it("Extend", function() {
        var dm = new DataManager();

        expect(dm.extend({}, {})).toEqual({});
        expect(dm.extend({a: 0}, {})).toEqual({a: 0});
        expect(dm.extend({a: 0}, {b: 1})).toEqual({a: 0, b: 1});
        expect(dm.extend({a: 0}, {a: 1})).toEqual({a: 1});
        expect(dm.extend({}, {b: 1})).toEqual({b: 1});
    });
});