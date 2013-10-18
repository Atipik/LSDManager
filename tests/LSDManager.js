require("atoum.js")(module);

module.include("../src/LSDManager.js");

module.exports = {
    testInstance: function () {
        var lsd;

        this
            .if(lsd = new LSDManager())
                .number(lsd.eventId)
                    .isEqualTo(0)
                .object(lsd.events)
                    .isEqualTo({})
                .object(lsd.entitiesMetadata)
                    .isEqualTo({})
                .object(lsd.storage)
                    .isInstanceOf(Storage)

            .if(storage = new Storage())
            .and(lsd = new LSDManager(storage))
                .object(lsd.storage)
                    .isIdenticalTo(storage)
        ;
    }
};