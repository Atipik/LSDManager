describe("DataManager class", function() {
    it("tests DataManager constructor", function() {
        var dm = new DataManager();

        expect(dm.eventId).toBe(0);
        expect(dm.events).toEqual({});
        expect(dm.entitiesMetadata).toEqual({});
    });
});